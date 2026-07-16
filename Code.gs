/**
 * Timeline Project — Apps Script backend
 * Fitur keamanan & performa:
 * - Password di-hash (salted SHA-256 + iterasi), TIDAK pernah dikirim ke client.
 * - Login diverifikasi di server (action=login). Plaintext lama otomatis di-upgrade ke hash saat login sukses.
 * - Penyimpanan per-baris (upsertTask/deleteTask/upsertUser/deleteUser) — tidak menimpa seluruh sheet.
 * - Shared token opsional (Script Property 'API_TOKEN') agar endpoint tidak bisa dipanggil sembarangan.
 * - LockService untuk mencegah tulis bersamaan yang saling menimpa.
 */

const SHEETS = {
  tasks: 'Tasks',
  projects: 'Projects',
  pics: 'PIC',
  categories: 'Categories',
  statuses: 'Statuses',
  requesters: 'Requesters',
  users: 'Users',
  teams: 'Teams',
  settings: 'Settings'
};

const TASK_HEADERS = ['id','title','projectId','pic','startDate','endDate','startTime','endTime','status','category','notes','link','createdAt','updatedAt','statusMode','invite','meetLink','calendarEventId','email_pic'];
const PROJECT_HEADERS = ['id','name','color','status','startMonth','requester','pic','outputLandscape','outputVertical','distribusi','lokasi1','lokasi2','folderLink','budget','flag','thumbnail','notes','archived','description','actualCost'];
const PIC_HEADERS = ['name','role','email','status','color','photo'];
const LIST_HEADERS = ['name'];
const USER_HEADERS = ['id','email','name','password','role','active','team'];
const TEAM_HEADERS = ['id','name','description'];
const SETTINGS_HEADERS = ['key','value'];

const PBKDF_ITER = 1000; // naikkan untuk lebih kuat; login akan sedikit lebih lambat

// Token API bersama dengan Next.js (Vercel env: SHEET_API_TOKEN harus berisi nilai yang sama).
// Ganti nilainya jika perlu. Script Property 'API_TOKEN' (jika diisi) lebih diprioritaskan daripada konstanta ini.
// Kosongkan string ini ('') DAN Script Property untuk menonaktifkan pengecekan token (mode dev).
const API_TOKEN = 'f30c2481a2e746fd7503bebbf463a358a9455b4230f2a1be';

/* ================= ROUTING ================= */

function doGet(e) {
  try {
    ensureSheets();
    var token = e && e.parameter ? e.parameter.token : '';
    if (!checkToken(token)) return jsonResponse({ success: false, message: 'Unauthorized: token salah.' });
    return jsonResponse(readAll());
  } catch (err) {
    return jsonResponse({ success: false, message: String(err), stack: err && err.stack ? err.stack : '' });
  }
}

function doPost(e) {
  try {
    ensureSheets();
    var payload = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '{}');
    if (!checkToken(payload.token)) return jsonResponse({ success: false, message: 'Unauthorized: token salah.' });
    var action = payload.action;
    switch (action) {
      case 'login':
        return jsonResponse(withLock(function () { return handleLogin(payload); }));
      case 'upsertTask':
        return jsonResponse(withLock(function () { return { success: true, task: upsertTask(payload.task || {}) }; }));
      case 'renamePic':
        return jsonResponse(withLock(function () { return { success: true, updated: renamePicInTasks(payload.from, payload.to) }; }));
      case 'upsertProject':
        return jsonResponse(withLock(function () { return { success: true, project: upsertRowById(SHEETS.projects, PROJECT_HEADERS, payload.project || {}) }; }));
      case 'deleteProject':
        return jsonResponse(withLock(function () { return { success: true, deleted: deleteRowById(SHEETS.projects, PROJECT_HEADERS, payload.id) }; }));
      case 'deleteTask':
        return jsonResponse(withLock(function () { return { success: true, deleted: deleteTaskWithEvent(payload.id) }; }));
      case 'upsertUser':
        return jsonResponse(withLock(function () { return { success: true, user: upsertUser(payload.user || {}, payload.newPassword) }; }));
      case 'deleteUser':
        return jsonResponse(withLock(function () { return { success: true, deleted: deleteRowById(SHEETS.users, USER_HEADERS, payload.id) }; }));
      case 'writeMeta':
        return jsonResponse(withLock(function () { writeMeta(payload); return { success: true }; }));
      case 'writeAll': // kompatibilitas: sinkron penuh task + master data, TIDAK menyentuh password user
        return jsonResponse(withLock(function () { writeAllSafe(payload); return { success: true, message: 'Sinkron penuh (task + master data) berhasil.' }; }));
      default:
        return jsonResponse({ success: false, message: 'Action tidak dikenal: ' + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, message: String(err), stack: err && err.stack ? err.stack : '' });
  }
}

function test() {
  ensureSheets();
  Logger.log(JSON.stringify(readAll(), null, 2));
}

/* ================= TOKEN & LOCK ================= */

function checkToken(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN') || API_TOKEN || '';
  if (!expected) return true; // token belum diset di mana pun (mode dev) -> izinkan.
  return String(provided || '') === String(expected);
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ================= PASSWORD ================= */

function bytesToHex(bytes) {
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function hashPassword(password, salt, iterations) {
  iterations = iterations || PBKDF_ITER;
  var bytes = Utilities.newBlob(String(salt) + '|' + String(password)).getBytes();
  for (var i = 0; i < iterations; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  }
  return bytesToHex(bytes);
}
function encodePassword(password) {
  var salt = Utilities.getUuid().replace(/-/g, '');
  return 'sha256$' + PBKDF_ITER + '$' + salt + '$' + hashPassword(password, salt, PBKDF_ITER);
}
function isHashed(stored) { return typeof stored === 'string' && stored.indexOf('sha256$') === 0; }
function verifyPassword(password, stored) {
  if (stored === '' || stored === null || stored === undefined) return false;
  if (isHashed(stored)) {
    var p = String(stored).split('$'); // [algo, iter, salt, hex]
    var iter = parseInt(p[1], 10) || PBKDF_ITER;
    return hashPassword(password, p[2], iter) === p[3];
  }
  return String(stored) === String(password); // legacy plaintext
}

function handleLogin(payload) {
  var email = String(payload.email || '').toLowerCase().trim();
  var password = String(payload.password || '');
  var row = findUserRowByEmail(email);
  if (row < 0) return { success: false, message: 'Email belum terdaftar di tab Users.' };
  var user = readRow(SHEETS.users, USER_HEADERS, row);
  var active = String(user.active).toLowerCase() !== 'false' && String(user.active).toLowerCase() !== 'inactive' && user.active !== '';
  if (!active) return { success: false, message: 'User non-aktif. Hubungi admin.' };
  if (!verifyPassword(password, user.password)) return { success: false, message: 'Password salah.' };
  if (!isHashed(user.password)) { // upgrade plaintext lama -> hash
    var col = USER_HEADERS.indexOf('password') + 1;
    getSheet(SHEETS.users).getRange(row, col).setValue(encodePassword(password));
  }
  return { success: true, user: publicUser(user) };
}

function publicUser(u) {
  return {
    id: u.id || '', email: String(u.email || '').toLowerCase(), name: u.name || u.email,
    role: u.role || 'Viewer',
    active: String(u.active).toLowerCase() !== 'false' && String(u.active).toLowerCase() !== 'inactive' && u.active !== '',
    team: u.team || '', hasPassword: !!u.password
  };
}

/* ================= READ ================= */

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function getSheet(name) { return ss().getSheetByName(name) || ss().insertSheet(name); }

function ensureSheets() {
  setupSheet(SHEETS.tasks, TASK_HEADERS);
  setupSheet(SHEETS.projects, PROJECT_HEADERS);
  setupSheet(SHEETS.pics, PIC_HEADERS);
  setupSheet(SHEETS.categories, LIST_HEADERS);
  setupSheet(SHEETS.statuses, LIST_HEADERS);
  setupSheet(SHEETS.requesters, LIST_HEADERS);
  setupSheet(SHEETS.users, USER_HEADERS);
  setupSheet(SHEETS.teams, TEAM_HEADERS);
  setupSheet(SHEETS.settings, SETTINGS_HEADERS);
}

function setupSheet(name, headers) {
  var sh = getSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  var existing = sh.getRange(1, 1, 1, Math.max(headers.length, sh.getLastColumn())).getValues()[0];
  var changed = false;
  headers.forEach(function (h, i) { if (existing[i] !== h) changed = true; });
  if (changed) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}

function readAll() {
  return {
    success: true,
    tasks: readObjects(SHEETS.tasks, TASK_HEADERS),
    projects: readObjects(SHEETS.projects, PROJECT_HEADERS).filter(function (p) { return p.id && p.name; }),
    pics: readObjects(SHEETS.pics, PIC_HEADERS).filter(function (p) { return p.name; }),
    categories: readObjects(SHEETS.categories, LIST_HEADERS).map(function (x) { return x.name; }).filter(Boolean),
    statuses: readObjects(SHEETS.statuses, LIST_HEADERS).map(function (x) { return x.name; }).filter(Boolean),
    requesters: readObjects(SHEETS.requesters, LIST_HEADERS).map(function (x) { return x.name; }).filter(Boolean),
    users: readObjects(SHEETS.users, USER_HEADERS).filter(function (u) { return u.email && u.name; }).map(publicUser), // tanpa password
    teams: readObjects(SHEETS.teams, TEAM_HEADERS),
    settings: readSettings()
  };
}

function readObjects(sheetName, headers) {
  var sh = getSheet(sheetName);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.filter(function (row) { return row.some(function (v) { return v !== ''; }); }).map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = formatValue(row[i]); });
    return obj;
  });
}

function readRow(sheetName, headers, row) {
  var vals = getSheet(sheetName).getRange(row, 1, 1, headers.length).getValues()[0];
  var obj = {};
  headers.forEach(function (h, i) { obj[h] = formatValue(vals[i]); });
  return obj;
}

function formatValue(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}

function readSettings() {
  var rows = readObjects(SHEETS.settings, SETTINGS_HEADERS);
  var obj = {};
  rows.forEach(function (r) { if (r.key) obj[r.key] = r.value; });
  return obj;
}

/* ================= PER-ROW WRITE ================= */

function findRowById(sheetName, headers, id) {
  var sh = getSheet(sheetName);
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var idCol = headers.indexOf('id') + 1;
  var ids = sh.getRange(2, idCol, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(id)) return i + 2; }
  return -1;
}

function findUserRowByEmail(email) {
  var sh = getSheet(SHEETS.users);
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var emailCol = USER_HEADERS.indexOf('email') + 1;
  var emails = sh.getRange(2, emailCol, last - 1, 1).getValues();
  for (var i = 0; i < emails.length; i++) { if (String(emails[i][0]).toLowerCase() === String(email).toLowerCase()) return i + 2; }
  return -1;
}

function rowValues(headers, obj) {
  return headers.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : obj[h]; });
}

// Ganti nama PIC di seluruh task sekaligus (dipakai saat PIC direname).
function renamePicInTasks(from, to) {
  if (!from || !to || from === to) return 0;
  var sh = getSheet(SHEETS.tasks);
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var col = TASK_HEADERS.indexOf('pic') + 1;
  var range = sh.getRange(2, col, last - 1, 1);
  var vals = range.getValues();
  var n = 0;
  for (var i = 0; i < vals.length; i++) { if (String(vals[i][0]) === String(from)) { vals[i][0] = to; n++; } }
  if (n) range.setValues(vals);
  return n;
}

function upsertRowById(sheetName, headers, obj) {
  var sh = getSheet(sheetName);
  var row = obj.id ? findRowById(sheetName, headers, obj.id) : -1;
  var values = rowValues(headers, obj);
  if (row > 0) sh.getRange(row, 1, 1, headers.length).setValues([values]);
  else sh.appendRow(values);
  return obj;
}

function upsertTask(task) {
  var sh = getSheet(SHEETS.tasks);
  var row = task.id ? findRowById(SHEETS.tasks, TASK_HEADERS, task.id) : -1;
  var existing = row > 0 ? readRow(SHEETS.tasks, TASK_HEADERS, row) : null;
  // email_pic: otomatis dari daftar PIC (dipisah koma) -> email, untuk sinkronisasi ke Beranda Cihuy.
  try {
    var names = String(task.pic || '').split(',');
    var emails = [];
    for (var ni = 0; ni < names.length; ni++) { var em = resolveEmail(names[ni].replace(/^\s+|\s+$/g, '')); if (em && emails.indexOf(em) < 0) emails.push(em); }
    task.email_pic = emails.join(', ');
  } catch (ePic) {}
  // Integrasi Google Calendar untuk task kategori "Meeting" (best-effort; kegagalan tidak menggagalkan simpan task).
  try {
    var isMeeting = String(task.category || '').toLowerCase() === 'meeting';
    var prevEventId = existing ? existing.calendarEventId : '';
    if (isMeeting && (task.startDate)) {
      var r = syncMeetingEvent(task, prevEventId);
      task.calendarEventId = r.eventId;
      task.meetLink = r.meetLink;
    } else if (prevEventId) {
      deleteCalendarEvent(prevEventId);
      task.calendarEventId = '';
      task.meetLink = '';
    }
  } catch (eCal) { task._calendarWarning = String(eCal); }
  // email_pic: email semua PIC terpilih (untuk sinkron ke aplikasi lain), dibuat otomatis saat simpan.
  task.email_pic = resolvePicEmails(task.pic);
  var values = rowValues(TASK_HEADERS, task);
  if (row > 0) sh.getRange(row, 1, 1, TASK_HEADERS.length).setValues([values]);
  else sh.appendRow(values);
  return task;
}

function deleteTaskWithEvent(id) {
  var row = findRowById(SHEETS.tasks, TASK_HEADERS, id);
  if (row < 0) return false;
  var t = readRow(SHEETS.tasks, TASK_HEADERS, row);
  if (t.calendarEventId) { try { deleteCalendarEvent(t.calendarEventId); } catch (e) {} }
  getSheet(SHEETS.tasks).deleteRow(row);
  return true;
}

/* ===== Google Calendar (kalender khusus "Timeline Meetings") ===== */
function getMeetingsCalendar() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('MEETINGS_CALENDAR_ID');
  if (id) { var c = CalendarApp.getCalendarById(id); if (c) return c; }
  var existing = CalendarApp.getCalendarsByName('Timeline Meetings');
  var cal = (existing && existing.length) ? existing[0] : CalendarApp.createCalendar('Timeline Meetings');
  props.setProperty('MEETINGS_CALENDAR_ID', cal.getId());
  return cal;
}
function resolveEmail(name) {
  if (!name) return '';
  var users = readObjects(SHEETS.users, USER_HEADERS);
  for (var i = 0; i < users.length; i++) { if (String(users[i].name).toLowerCase() === String(name).toLowerCase() && users[i].email) return String(users[i].email); }
  var pics = readObjects(SHEETS.pics, PIC_HEADERS);
  for (var j = 0; j < pics.length; j++) { if (String(pics[j].name).toLowerCase() === String(name).toLowerCase() && pics[j].email) return String(pics[j].email); }
  return '';
}
function resolvePicEmails(picStr) {
  var names = String(picStr || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var emails = [];
  names.forEach(function (n) { var e = resolveEmail(n); if (e && emails.indexOf(e) < 0) emails.push(e); });
  return emails.join(', ');
}
function buildEventTimes(task) {
  var sd = String(task.startDate || ''); if (!sd) return null;
  var ed = String(task.endDate || task.startDate || '');
  function mk(dateStr, timeStr, defH, defM) { var p = dateStr.split('-'); var h = defH, m = defM; if (timeStr && String(timeStr).indexOf(':') >= 0) { var t = String(timeStr).split(':'); h = parseInt(t[0], 10); m = parseInt(t[1], 10); } return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), h, m, 0); }
  var st = String(task.startTime || ''), et = String(task.endTime || '');
  var start = mk(sd, st, 10, 0);
  var end;
  if (et) end = mk(ed, et, 11, 0);
  else if (st) end = new Date(start.getTime() + 3600000);
  else end = mk(ed, '', 11, 0);
  if (end <= start) end = new Date(start.getTime() + 3600000);
  return { start: start, end: end };
}
function collectGuests(task) {
  var set = {};
  // Default: undang SEMUA PIC di menu PIC/Team yang punya email (atau bisa di-resolve dari Users).
  var pics = readObjects(SHEETS.pics, PIC_HEADERS);
  pics.forEach(function (p) { var e = p.email ? String(p.email).trim() : (p.name ? resolveEmail(p.name) : ''); if (e && e.indexOf('@') > 0) set[e.toLowerCase()] = true; });
  // Kolom "Invite" pada task: untuk orang DI LUAR menu PIC.
  String(task.invite || '').split(/[,;\s]+/).forEach(function (e) { e = String(e).trim(); if (e.indexOf('@') > 0) set[e.toLowerCase()] = true; });
  // Jangan undang akun pemilik Apps Script (pemilik kalender "Timeline Meetings"): event sudah tampil di
  // kalender tersebut, jadi mengundangnya sebagai tamu hanya membuat salinan dobel di kalender utamanya.
  try { var owner = Session.getEffectiveUser().getEmail(); if (owner) delete set[owner.toLowerCase()]; } catch (eOwner) {}
  return Object.keys(set);
}
function syncMeetingEvent(task, existingEventId) {
  var times = buildEventTimes(task);
  if (!times) return { eventId: existingEventId || '', meetLink: task.meetLink || '' };
  var cal = getMeetingsCalendar();
  var calId = cal.getId();
  var guests = collectGuests(task);
  var desc = 'Task Timeline: ' + (task.title || '') + (task.notes ? ('\n\n' + task.notes) : '');
  var advancedOk = (typeof Calendar !== 'undefined' && Calendar.Events);
  if (advancedOk) {
    try {
      var resource = {
        summary: task.title || 'Meeting', description: desc,
        start: { dateTime: times.start.toISOString() }, end: { dateTime: times.end.toISOString() },
        attendees: guests.map(function (e) { return { email: e }; }),
        conferenceData: { createRequest: { requestId: 'tl-' + (task.id || Utilities.getUuid()), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
      };
      var res;
      if (existingEventId) { try { res = Calendar.Events.patch(resource, calId, existingEventId, { conferenceDataVersion: 1, sendUpdates: 'all' }); } catch (e0) { res = Calendar.Events.insert(resource, calId, { conferenceDataVersion: 1, sendUpdates: 'all' }); } }
      else { res = Calendar.Events.insert(resource, calId, { conferenceDataVersion: 1, sendUpdates: 'all' }); }
      var link = res.hangoutLink || (res.conferenceData && res.conferenceData.entryPoints && res.conferenceData.entryPoints[0] ? res.conferenceData.entryPoints[0].uri : '');
      return { eventId: res.id, meetLink: link || '' };
    } catch (eAdv) { /* fallback ke CalendarApp */ }
  }
  var ev = null;
  if (existingEventId) { try { ev = cal.getEventById(existingEventId); } catch (e1) { ev = null; } }
  if (ev) {
    ev.setTitle(task.title || 'Meeting'); ev.setTime(times.start, times.end); ev.setDescription(desc);
    var current = {}; ev.getGuestList().forEach(function (g) { current[g.getEmail().toLowerCase()] = true; });
    guests.forEach(function (e) { if (!current[e.toLowerCase()]) { try { ev.addGuest(e); } catch (e2) {} } });
    return { eventId: existingEventId, meetLink: task.meetLink || '' };
  }
  var newEv = cal.createEvent(task.title || 'Meeting', times.start, times.end, { description: desc, guests: guests.join(','), sendInvites: true });
  return { eventId: newEv.getId(), meetLink: '' };
}
function deleteCalendarEvent(eventId) {
  if (!eventId) return;
  var cal = getMeetingsCalendar();
  var advancedOk = (typeof Calendar !== 'undefined' && Calendar.Events);
  if (advancedOk) { try { Calendar.Events.remove(cal.getId(), eventId, { sendUpdates: 'all' }); return; } catch (e) {} }
  try { var ev = cal.getEventById(eventId); if (ev) ev.deleteEvent(); } catch (e2) {}
}

function deleteRowById(sheetName, headers, id) {
  var row = findRowById(sheetName, headers, id);
  if (row > 0) { getSheet(sheetName).deleteRow(row); return true; }
  return false;
}

function upsertUser(u, newPassword) {
  var sh = getSheet(SHEETS.users);
  var id = u.id || ('user-' + Utilities.getUuid());
  var row = findRowById(SHEETS.users, USER_HEADERS, id);
  var existing = row > 0 ? readRow(SHEETS.users, USER_HEADERS, row) : null;
  var passwordField;
  if (newPassword) passwordField = encodePassword(String(newPassword));
  else if (existing) passwordField = existing.password; // preserve hash
  else passwordField = '';
  var obj = {
    id: id, email: String(u.email || '').toLowerCase(), name: u.name || u.email,
    password: passwordField, role: u.role || 'Viewer',
    active: u.active === false ? false : true, team: u.team || ''
  };
  var values = rowValues(USER_HEADERS, obj);
  if (row > 0) sh.getRange(row, 1, 1, USER_HEADERS.length).setValues([values]);
  else sh.appendRow(values);
  return publicUser(obj);
}

function writeMeta(payload) {
  if (payload.projects) writeObjects(SHEETS.projects, PROJECT_HEADERS, payload.projects);
  if (payload.pics) writeObjects(SHEETS.pics, PIC_HEADERS, payload.pics.map(function (p) { return typeof p === 'string' ? { name: p, role: '', email: '', status: 'Active', color: '', photo: '' } : p; }));
  if (payload.categories) writeObjects(SHEETS.categories, LIST_HEADERS, payload.categories.map(function (name) { return typeof name === 'string' ? { name: name } : name; }));
  if (payload.statuses) writeObjects(SHEETS.statuses, LIST_HEADERS, payload.statuses.map(function (name) { return typeof name === 'string' ? { name: name } : name; }));
  if (payload.requesters) writeObjects(SHEETS.requesters, LIST_HEADERS, payload.requesters.map(function (name) { return typeof name === 'string' ? { name: name } : name; }));
  if (payload.teams) writeObjects(SHEETS.teams, TEAM_HEADERS, payload.teams);
  if (payload.settings) writeSettings(payload.settings);
}

// Sinkron penuh yang aman: menulis tasks + master data, TIDAK menyentuh tab Users (password aman).
function writeAllSafe(payload) {
  if (payload.tasks) writeObjects(SHEETS.tasks, TASK_HEADERS, payload.tasks);
  writeMeta(payload);
}

function writeObjects(sheetName, headers, rows) {
  var sh = getSheet(sheetName);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) {
    var values = rows.map(function (obj) { return rowValues(headers, obj); });
    sh.getRange(2, 1, values.length, headers.length).setValues(values);
  }
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, headers.length);
}

function writeSettings(settings) {
  var rows = Object.keys(settings).map(function (key) { return { key: key, value: settings[key] }; });
  writeObjects(SHEETS.settings, SETTINGS_HEADERS, rows);
}


/* ================= NOTIFIKASI FINANCE (H-3 s/d Hari-H) =================
 * Cara aktifkan:
 * 1) Isi "Email Notifikasi Finance" di halaman Pengaturan aplikasi (atau tab Settings,
 *    key: financeNotifEmails, value: email dipisah koma).
 * 2) Di Apps Script: Triggers (ikon jam) -> Add Trigger -> function: sendFinanceReminders,
 *    event source: Time-driven -> Day timer -> pilih jam (mis. 7-8 pagi).
 * Setiap hari, task kategori "Finance" yang deadline-nya hari ini s/d 3 hari lagi
 * (dan belum Done/Canceled) akan dikirim sebagai satu email rekap: H-3, H-2, H-1, Hari-H.
 */
function sendFinanceReminders() {
  ensureSheets();
  var settings = readSettings();
  var recipients = String(settings.financeNotifEmails || '').trim();
  if (!recipients) return;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var tasks = readObjects(SHEETS.tasks, TASK_HEADERS);
  var buckets = { 0: [], 1: [], 2: [], 3: [] };
  tasks.forEach(function (t) {
    if (String(t.category || '').toLowerCase() !== 'finance') return;
    var st = String(t.status || '');
    if (st === 'Done' || st === 'Canceled') return;
    var dueStr = String(t.endDate || t.startDate || '');
    if (!dueStr) return;
    var p = dueStr.split('-');
    var due = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    due.setHours(0, 0, 0, 0);
    var diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diff >= 0 && diff <= 3) buckets[diff].push(t);
  });
  var total = buckets[0].length + buckets[1].length + buckets[2].length + buckets[3].length;
  if (!total) return;
  var labels = { 0: 'HARI INI (Hari-H)', 1: 'H-1 (besok)', 2: 'H-2', 3: 'H-3' };
  var html = '<h2 style="margin:0 0 12px">Reminder Task Finance</h2>';
  var plain = 'Reminder Task Finance\n\n';
  [0, 1, 2, 3].forEach(function (d) {
    if (!buckets[d].length) return;
    html += '<h3 style="margin:16px 0 6px;color:' + (d === 0 ? '#b91c1c' : '#b45309') + '">' + labels[d] + '</h3><ul style="margin:0;padding-left:18px">';
    plain += labels[d] + ':\n';
    buckets[d].forEach(function (t) {
      var due = t.endDate || t.startDate;
      var line = t.title + ' — deadline ' + due + (t.pic ? ' — PIC: ' + t.pic : '');
      html += '<li style="margin:3px 0">' + line + (t.link ? ' — <a href="' + t.link + '">link</a>' : '') + '</li>';
      plain += '- ' + line + '\n';
    });
    html += '</ul>';
    plain += '\n';
  });
  var subject = '[Timeline] ' + total + ' task Finance mendekati deadline';
  MailApp.sendEmail({ to: recipients, subject: subject, body: plain, htmlBody: html });
}
