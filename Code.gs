const SHEETS = {
  tasks: 'Tasks',
  projects: 'Projects',
  pics: 'PIC',
  categories: 'Categories',
  statuses: 'Statuses',
  users: 'Users',
  teams: 'Teams',
  settings: 'Settings'
};

const TASK_HEADERS = ['id','title','projectId','pic','startDate','endDate','startTime','endTime','status','category','notes','link','createdAt','updatedAt'];
const PROJECT_HEADERS = ['id','name','color','status','description'];
const PIC_HEADERS = ['name','role','email','status'];
const LIST_HEADERS = ['name'];
const USER_HEADERS = ['id','email','name','password','role','active','team'];
const TEAM_HEADERS = ['id','name','description'];
const SETTINGS_HEADERS = ['key','value'];

function doGet(e) {
  try {
    ensureSheets();
    return jsonResponse(readAll());
  } catch (err) {
    return jsonResponse({ success: false, message: String(err), stack: err && err.stack ? err.stack : '' });
  }
}

function doPost(e) {
  try {
    ensureSheets();
    const payload = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    if (payload.action === 'writeAll') {
      writeAll(payload);
      return jsonResponse({ success: true, message: 'Data berhasil ditulis ke Google Sheet' });
    }
    return jsonResponse({ success: false, message: 'Action tidak dikenal' });
  } catch (err) {
    return jsonResponse({ success: false, message: String(err), stack: err && err.stack ? err.stack : '' });
  }
}

function test() {
  ensureSheets();
  Logger.log(JSON.stringify(readAll(), null, 2));
}

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
  setupSheet(SHEETS.users, USER_HEADERS);
  setupSheet(SHEETS.teams, TEAM_HEADERS);
  setupSheet(SHEETS.settings, SETTINGS_HEADERS);
}

function setupSheet(name, headers) {
  const sh = getSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  const existing = sh.getRange(1, 1, 1, Math.max(headers.length, sh.getLastColumn())).getValues()[0];
  let changed = false;
  headers.forEach((h, i) => { if (existing[i] !== h) changed = true; });
  if (changed) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}

function readAll() {
  return {
    success: true,
    tasks: readObjects(SHEETS.tasks, TASK_HEADERS),
    projects: readObjects(SHEETS.projects, PROJECT_HEADERS).filter(p => p.id && p.name),
    pics: readObjects(SHEETS.pics, PIC_HEADERS).map(p => p.name).filter(Boolean),
    categories: readObjects(SHEETS.categories, LIST_HEADERS).map(x => x.name).filter(Boolean),
    statuses: readObjects(SHEETS.statuses, LIST_HEADERS).map(x => x.name).filter(Boolean),
    users: readObjects(SHEETS.users, USER_HEADERS).filter(u => u.email && u.name).map(normalizeUser),
    teams: readObjects(SHEETS.teams, TEAM_HEADERS),
    settings: readSettings()
  };
}

function normalizeUser(u) {
  return {
    id: u.id || ('user-' + Utilities.getUuid()),
    email: String(u.email || '').toLowerCase(),
    name: u.name || u.email,
    password: u.password || '',
    role: u.role || 'Viewer',
    active: String(u.active).toLowerCase() !== 'false' && String(u.active).toLowerCase() !== 'inactive' && u.active !== '',
    team: u.team || ''
  };
}

function readObjects(sheetName, headers) {
  const sh = getSheet(sheetName);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.filter(row => row.some(v => v !== '')).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = formatValue(row[i]));
    return obj;
  });
}

function formatValue(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}

function readSettings() {
  const rows = readObjects(SHEETS.settings, SETTINGS_HEADERS);
  const obj = {};
  rows.forEach(r => { if (r.key) obj[r.key] = r.value; });
  return obj;
}

function writeAll(payload) {
  writeObjects(SHEETS.tasks, TASK_HEADERS, payload.tasks || []);
  writeObjects(SHEETS.projects, PROJECT_HEADERS, payload.projects || []);
  writeObjects(SHEETS.pics, PIC_HEADERS, (payload.pics || []).map(name => typeof name === 'string' ? { name, role: '', email: '', status: 'Active' } : name));
  writeObjects(SHEETS.categories, LIST_HEADERS, (payload.categories || []).map(name => typeof name === 'string' ? { name } : name));
  writeObjects(SHEETS.statuses, LIST_HEADERS, (payload.statuses || []).map(name => typeof name === 'string' ? { name } : name));
  writeObjects(SHEETS.users, USER_HEADERS, (payload.users || []).map(normalizeUser));
  writeObjects(SHEETS.teams, TEAM_HEADERS, payload.teams || []);
  writeSettings(payload.settings || {});
}

function writeObjects(sheetName, headers, rows) {
  const sh = getSheet(sheetName);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) {
    const values = rows.map(obj => headers.map(h => obj[h] === undefined || obj[h] === null ? '' : obj[h]));
    sh.getRange(2, 1, values.length, headers.length).setValues(values);
  }
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, headers.length);
}

function writeSettings(settings) {
  const rows = Object.keys(settings).map(key => ({ key, value: settings[key] }));
  writeObjects(SHEETS.settings, SETTINGS_HEADERS, rows);
}
