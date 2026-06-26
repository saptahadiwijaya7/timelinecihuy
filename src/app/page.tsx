'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Folder, LayoutDashboard, ListTodo, Menu, Plus, Search, Settings, Trash2, Users, X, Download, Upload, Save, KanbanSquare, AlertTriangle } from 'lucide-react';
import { categories as defaultCategories, pics as defaultPics, projects as defaultProjects, seedTasks, settings as defaultSettings, statuses as defaultStatuses, users as defaultUsers } from '@/lib/data';
import { AppUser, Project, SheetData, Status, Task, TaskPayload, WorkspaceSettings } from '@/lib/types';

const STORAGE_KEY = 'timeline-project-suite-v4';
const USER_KEY = 'timeline-project-current-user';
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const viewButtons = ['Bulan', 'Minggu', 'Quarter', 'Timeline', 'Gantt'] as const;
type View = typeof viewButtons[number];
type Page = 'Kalender' | 'Timeline' | 'Kanban' | 'Tasks' | 'Projects' | 'PIC / Team' | 'Pengaturan';
type Filter = { projectId: string; pic: string; status: string; category: string; search: string };
type FormState = TaskPayload;
const emptyFilter: Filter = { projectId: 'all', pic: 'all', status: 'all', category: 'all', search: '' };

function uid(prefix = 'task') { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function pad(n: number) { return String(n).padStart(2, '0'); }
function toIsoDate(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function parseIso(iso: string) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
function sameMonth(date: Date, monthDate: Date) { return date.getMonth() === monthDate.getMonth() && date.getFullYear() === monthDate.getFullYear(); }
function getMondayStart(date: Date) { const d = new Date(date); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + diff); d.setHours(0, 0, 0, 0); return d; }
function getCalendarDays(month: Date) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = getMondayStart(first); return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; }); }
function diffDays(a: string, b: string) { return Math.max(0, Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86400000)); }
function addDays(iso: string, days: number) { const d = parseIso(iso); d.setDate(d.getDate() + days); return toIsoDate(d); }
function tint(hex: string) { return `${hex}28`; }
function isTaskOnDate(task: Task, iso: string) { const end = task.endDate || task.startDate; return task.startDate <= iso && end >= iso; }
function defaultForm(date: string): FormState { return { title: '', projectId: 'campaign', pic: 'Admin', startDate: date, endDate: date, startTime: '', endTime: '', status: 'Planned', category: 'Briefing', notes: '', link: '' }; }
function projectById(projects: Project[], id: string) { return projects.find((project) => project.id === id) ?? projects[projects.length - 1]; }

export default function Home() {
  const [month, setMonth] = useState(() => new Date(2026, 5, 1));
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [projects, setProjects] = useState<Project[]>(defaultProjects);
  const [pics, setPics] = useState<string[]>(defaultPics);
  const [categories, setCategories] = useState<string[]>(defaultCategories);
  const [statuses, setStatuses] = useState<string[]>(defaultStatuses);
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultSettings);
  const [users, setUsers] = useState<AppUser[]>(defaultUsers);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(seedTasks[0]?.id ?? null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => defaultForm(todayIso()));
  const [filter, setFilter] = useState<Filter>(emptyFilter);
  const [view, setView] = useState<View>('Bulan');
  const [page, setPage] = useState<Page>('Kalender');
  const [syncMessage, setSyncMessage] = useState('Menyiapkan data workspace...');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [zoom, setZoom] = useState(80);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef('');
  const isSavingRef = useRef(false);
  const isPollingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    async function bootstrapWorkspace() {
      const savedEmail = window.localStorage.getItem(USER_KEY);
      setCurrentEmail(savedEmail);
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const data = JSON.parse(saved) as SheetData;
          setTasks(data.tasks || seedTasks);
          setProjects(data.projects || defaultProjects);
          setPics(data.pics || defaultPics);
          setCategories(data.categories || defaultCategories);
          setStatuses(data.statuses || defaultStatuses);
          setSettings(data.settings || defaultSettings);
          setUsers(data.users || defaultUsers);
          lastSavedSnapshotRef.current = snapshot({
            tasks: data.tasks || seedTasks,
            projects: data.projects || defaultProjects,
            pics: data.pics || defaultPics,
            categories: data.categories || defaultCategories,
            statuses: data.statuses || defaultStatuses,
            settings: data.settings || defaultSettings,
            users: data.users || defaultUsers,
          });
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }

      try {
        setSyncMessage('Mengambil Users & data terbaru dari Google Sheet...');
        const res = await fetch('/api/data', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !data.tasks) throw new Error(data.message || 'Gagal memuat data Google Sheet');
        if (!alive) return;
        const nextData = {
          tasks: data.tasks,
          projects: data.projects?.length ? data.projects : defaultProjects,
          pics: data.pics?.length ? data.pics : defaultPics,
          categories: data.categories?.length ? data.categories : defaultCategories,
          statuses: data.statuses?.length ? data.statuses : defaultStatuses,
          settings: data.settings || defaultSettings,
          users: data.users?.length ? data.users : defaultUsers
        };
        setTasks(nextData.tasks);
        setProjects(nextData.projects);
        setPics(nextData.pics);
        setCategories(nextData.categories);
        setStatuses(nextData.statuses);
        setSettings(nextData.settings);
        setUsers(nextData.users);
        lastSavedSnapshotRef.current = snapshot(nextData);
        setSyncMessage(`Data siap. ${nextData.users.length} user dan ${nextData.tasks.length} task berhasil dimuat dari Google Sheet.`);
      } catch (err) {
        setSyncMessage(err instanceof Error ? `Gagal auto-load Google Sheet: ${err.message}. Menggunakan data lokal/default.` : 'Gagal auto-load Google Sheet. Menggunakan data lokal/default.');
      } finally {
        if (alive) setIsBootstrapping(false);
      }
    }
    bootstrapWorkspace();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, projects, pics, categories, statuses, settings, users }));
  }, [tasks, projects, pics, categories, statuses, settings, users]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const project = projectById(projects, task.projectId);
    const q = filter.search.toLowerCase();
    const matchesSearch = !q || [task.title, task.pic, task.category, project.name, task.status, task.notes].join(' ').toLowerCase().includes(q);
    return matchesSearch && (filter.projectId === 'all' || task.projectId === filter.projectId) && (filter.pic === 'all' || task.pic === filter.pic) && (filter.status === 'all' || task.status === filter.status) && (filter.category === 'all' || task.category === filter.category);
  }), [tasks, projects, filter]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? null;
  const days = getCalendarDays(month);
  const currentUser = useMemo(() => users.find(u => u.active && u.email.toLowerCase() === (currentEmail || '').toLowerCase()) || null, [users, currentEmail]);
  const role = currentUser?.role || 'Guest';
  const canCreate = ['Admin', 'Manager', 'Member'].includes(role);
  const canManage = ['Admin', 'Manager'].includes(role);
  const canDelete = role === 'Admin';
  const canManageUsers = role === 'Admin';

  function openCreate(date: string) { if (!canCreate) { setSyncMessage('Akses ditolak: role kamu hanya bisa melihat data.'); return; } setForm(defaultForm(date)); setModalOpen(true); }
  function openEdit(task: Task) { setForm({ ...task, endDate: task.endDate || task.startDate }); setSelectedTaskId(task.id); setModalOpen(true); setDrawerOpen(true); }
  function saveTask() {
    if (!canCreate) { setSyncMessage('Akses ditolak: tidak boleh menambah/edit task.'); return; }
    if (!form.title.trim()) return;
    const now = new Date().toISOString();
    const clean = { ...form, endDate: form.endDate || form.startDate };
    setTasks((current) => form.id ? current.map((task) => task.id === form.id ? { ...task, ...clean, updatedAt: now } as Task : task) : [...current, { ...clean, id: uid(), createdAt: now, updatedAt: now } as Task]);
    setModalOpen(false);
  }
  function deleteTask(id: string) { if (!canDelete) { setSyncMessage('Akses ditolak: hanya Admin yang bisa hapus task.'); return; } setTasks((current) => current.filter((task) => task.id !== id)); if (selectedTaskId === id) setSelectedTaskId(null); }
  function moveTaskDate(taskId: string, newStart: string) { setTasks((current) => current.map(task => { if (task.id !== taskId) return task; const span = diffDays(task.startDate, task.endDate || task.startDate); return { ...task, startDate: newStart, endDate: addDays(newStart, span), updatedAt: new Date().toISOString() }; })); }
  function nextMonth(step: number) { setMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1)); }
  function switchPage(label: Page) { setPage(label); if (label === 'Kalender') setView('Bulan'); if (label === 'Timeline') setView('Timeline'); }
  function exportJson() { const blob = new Blob([JSON.stringify({ tasks, projects, pics, categories, statuses, settings }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'timeline-project-data.json'; a.click(); URL.revokeObjectURL(url); }
  function makePayload() { return { tasks, projects, pics, categories, statuses, settings, users }; }
  function snapshot(payload: SheetData) { return JSON.stringify(payload); }
  async function savePayloadToSheet(payload: SheetData, label = 'Auto save') {
    isSavingRef.current = true;
    try {
      const res = await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.message || 'Gagal simpan ke Google Sheet');
      lastSavedSnapshotRef.current = snapshot(payload);
      setSyncMessage(`${label} berhasil ke Google Sheet (${new Date().toLocaleTimeString('id-ID')}).`);
    } finally {
      isSavingRef.current = false;
    }
  }
  async function syncFromSheet() {
    setSyncMessage('Mengambil data dari Google Sheet...');
    try { const res = await fetch('/api/data', { cache: 'no-store' }); const data = await res.json(); if (!res.ok || !data.tasks) throw new Error(data.message || 'Gagal sync'); const nextData = { tasks: data.tasks, projects: data.projects?.length ? data.projects : defaultProjects, pics: data.pics?.length ? data.pics : defaultPics, categories: data.categories?.length ? data.categories : defaultCategories, statuses: data.statuses?.length ? data.statuses : defaultStatuses, settings: data.settings || defaultSettings, users: data.users?.length ? data.users : defaultUsers }; setTasks(nextData.tasks); setProjects(nextData.projects); setPics(nextData.pics); setCategories(nextData.categories); setStatuses(nextData.statuses); setSettings(nextData.settings); setUsers(nextData.users); lastSavedSnapshotRef.current = snapshot(nextData); setSyncMessage(`Berhasil refresh ${data.tasks.length} task dari Google Sheet.`); }
    catch (err) { setSyncMessage(err instanceof Error ? err.message : 'Gagal sync Google Sheet.'); }
  }

  async function backgroundRefreshFromSheet() {
    if (isPollingRef.current || isSavingRef.current) return;
    isPollingRef.current = true;
    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.tasks) throw new Error(data.message || 'Gagal auto refresh');
      const nextData = {
        tasks: data.tasks,
        projects: data.projects?.length ? data.projects : defaultProjects,
        pics: data.pics?.length ? data.pics : defaultPics,
        categories: data.categories?.length ? data.categories : defaultCategories,
        statuses: data.statuses?.length ? data.statuses : defaultStatuses,
        settings: data.settings || defaultSettings,
        users: data.users?.length ? data.users : defaultUsers
      };
      const remoteSnapshot = snapshot(nextData);
      const localSnapshot = snapshot(makePayload());
      if (remoteSnapshot === localSnapshot) return;
      if (lastSavedSnapshotRef.current && localSnapshot !== lastSavedSnapshotRef.current) {
        setSyncMessage('Ada update dari user lain, tapi perubahan lokal belum tersimpan. Auto refresh ditunda.');
        return;
      }
      setTasks(nextData.tasks);
      setProjects(nextData.projects);
      setPics(nextData.pics);
      setCategories(nextData.categories);
      setStatuses(nextData.statuses);
      setSettings(nextData.settings);
      setUsers(nextData.users);
      lastSavedSnapshotRef.current = remoteSnapshot;
      setSyncMessage(`Auto refresh: data terbaru dari Google Sheet diterima (${new Date().toLocaleTimeString('id-ID')}).`);
    } catch (err) {
      setSyncMessage(err instanceof Error ? `Auto refresh gagal: ${err.message}` : 'Auto refresh gagal.');
    } finally {
      isPollingRef.current = false;
    }
  }

  async function pushToSheet() {
    if (!canCreate) { setSyncMessage('Akses ditolak: role kamu hanya bisa melihat data.'); return; }
    setSyncMessage('Menyimpan manual ke Google Sheet...');
    try { await savePayloadToSheet(makePayload(), 'Simpan manual'); }
    catch (err) { setSyncMessage(err instanceof Error ? err.message : 'Gagal simpan Google Sheet.'); }
  }
  useEffect(() => {
    if (!currentUser || !canCreate) return;
    const payload = makePayload();
    const currentSnapshot = snapshot(payload);
    if (!lastSavedSnapshotRef.current) { lastSavedSnapshotRef.current = currentSnapshot; return; }
    if (lastSavedSnapshotRef.current === currentSnapshot) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setSyncMessage('Perubahan terdeteksi. Auto save dalam proses...');
    autoSaveTimerRef.current = setTimeout(() => {
      savePayloadToSheet(payload, 'Auto save').catch((err) => {
        setSyncMessage(err instanceof Error ? `Auto save gagal: ${err.message}` : 'Auto save gagal.');
      });
    }, 900);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [tasks, projects, pics, categories, statuses, settings, users, currentUser, canCreate]);

  useEffect(() => {
    if (!currentUser) return;
    const interval = window.setInterval(() => {
      backgroundRefreshFromSheet();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [currentUser, tasks, projects, pics, categories, statuses, settings, users]);

  const kpis = useMemo(() => ({ total: filteredTasks.length, progress: filteredTasks.filter(t => t.status === 'Progress').length, dueSoon: filteredTasks.filter(t => { const end = parseIso(t.endDate || t.startDate).getTime(); const now = new Date(); return end >= now.getTime() && end - now.getTime() <= 3 * 86400000 && t.status !== 'Done'; }).length }), [filteredTasks]);
  function login() { const email = loginEmail.trim().toLowerCase(); const password = loginPassword; const user = users.find(u => u.active && u.email.toLowerCase() === email); if (!user) { setSyncMessage('Email belum terdaftar / tidak aktif di sheet Users.'); return; } if (!user.password || String(user.password) !== password) { setSyncMessage('Password salah. Cek password di tab Users.'); return; } lastSavedSnapshotRef.current = snapshot(makePayload()); window.localStorage.setItem(USER_KEY, email); setCurrentEmail(email); setSyncMessage(`Login sebagai ${user.name} (${user.role}). Auto save + auto refresh aktif.`); }
  function logout() { window.localStorage.removeItem(USER_KEY); setCurrentEmail(null); setLoginEmail(''); setLoginPassword(''); }

  if (isBootstrapping) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="w-full max-w-md rounded-3xl border bg-white p-8 text-center shadow-soft"><div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600"><CalendarDays size={34}/></div><h1 className="text-2xl font-bold">Timeline Project</h1><p className="mt-2 text-sm text-slate-500">Loading workspace, users, dan data terbaru dari Google Sheet...</p><div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600" /></div><p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">{syncMessage}</p></section></main>;

  if (!currentUser) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="w-full max-w-lg rounded-3xl border bg-white p-8 shadow-soft"><div className="mb-6 flex items-center gap-3"><CalendarDays size={36} className="text-blue-600"/><div><h1 className="text-2xl font-bold">{settings.workspaceName}</h1><p className="text-sm text-slate-500">Login internal. Users otomatis dimuat dari Google Sheet</p></div></div><label className="mb-2 block text-sm font-semibold text-slate-600">Email</label><input className="input mb-4" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="branding@cpssoft.com"/><label className="mb-2 block text-sm font-semibold text-slate-600">Password</label><input type="password" className="input mb-4" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') login(); }} placeholder="Masukkan password"/><button onClick={login} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Masuk</button><p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">{syncMessage}</p><p className="mt-4 text-xs text-slate-500">Akses diatur dari tab <b>Users</b>: Admin, Manager, Member, Viewer. Demo: admin@example.com / admin123, manager@example.com / manager123, member@example.com / member123, viewer@example.com / viewer123.</p></section></main>;

  return <main className="min-h-screen bg-slate-50">
    <aside className="fixed left-0 top-0 z-20 hidden h-screen w-72 flex-col bg-slate-950 text-white lg:flex">
      <div className="flex items-center gap-3 px-6 py-6"><CalendarDays size={34}/><div><h1 className="text-xl font-bold">{settings.workspaceName}</h1><p className="text-sm text-slate-300">Multimedia Team</p></div></div>
      <nav className="px-4 text-sm font-medium">{([['Kalender', CalendarDays], ['Timeline', LayoutDashboard], ['Kanban', KanbanSquare], ['Tasks', ListTodo], ['Projects', Folder], ['PIC / Team', Users], ['Pengaturan', Settings]] as any).map(([label, Icon]: [Page, any]) => <button key={label} onClick={() => switchPage(label)} className={`mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${page === label ? 'bg-blue-600' : 'hover:bg-white/10'}`}><Icon size={18}/>{label}</button>)}</nav>
      <div className="mt-4 border-t border-white/10 px-4 py-5"><p className="mb-3 text-xs uppercase text-slate-400">Filter</p><FilterSelect label="Semua Project" value={filter.projectId} onChange={(v) => setFilter({ ...filter, projectId: v })} options={[[ 'all', 'Semua Project' ], ...projects.map(p => [p.id, p.name])]} /><FilterSelect label="Semua PIC" value={filter.pic} onChange={(v) => setFilter({ ...filter, pic: v })} options={[[ 'all', 'Semua PIC' ], ...pics.map(p => [p, p])]} /><FilterSelect label="Semua Status" value={filter.status} onChange={(v) => setFilter({ ...filter, status: v })} options={[[ 'all', 'Semua Status' ], ...statuses.map(s => [s, s])]} /><FilterSelect label="Semua Kategori" value={filter.category} onChange={(v) => setFilter({ ...filter, category: v })} options={[[ 'all', 'Semua Kategori' ], ...categories.map(c => [c, c])]} /></div>
      <div className="mt-auto px-4 pb-6 text-xs text-slate-300"><div className="mb-3 rounded-xl bg-white/10 p-4"><p>{syncMessage}</p></div><button onClick={syncFromSheet} className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 font-semibold text-white"><Download size={16}/>Refresh dari Google Sheet</button><button onClick={pushToSheet} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 font-semibold text-white"><Upload size={16}/>Simpan Manual</button></div>
    </aside>
    <section className="lg:pl-72"><Header page={page} filter={filter} setFilter={setFilter} exportJson={exportJson} currentUser={currentUser} role={role} logout={logout}/><div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="p-5 lg:p-8"><KpiRow kpis={kpis}/>{page === 'Kalender' && <><CalendarToolbar month={month} setMonth={setMonth} nextMonth={nextMonth} view={view} setView={setView} openCreate={openCreate} zoom={zoom} setZoom={setZoom}/>{view === 'Bulan' && <CalendarView days={days} month={month} tasks={filteredTasks} projects={projects} onCreate={openCreate} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} onMove={moveTaskDate} />}{view === 'Minggu' && <WeekView month={month} tasks={filteredTasks} projects={projects} onCreate={openCreate} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} onMove={moveTaskDate}/>} {view === 'Quarter' && <QuarterView month={month} zoom={zoom} tasks={filteredTasks} projects={projects} onCreate={openCreate} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} onMove={moveTaskDate}/>} {view === 'Timeline' && <TimelineView tasks={filteredTasks} projects={projects} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} />} {view === 'Gantt' && <GanttView month={month} tasks={filteredTasks} projects={projects} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }}/>}<Legend projects={projects}/></>}{page === 'Timeline' && <TimelineView tasks={filteredTasks} projects={projects} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} />}{page === 'Kanban' && <KanbanView statuses={statuses} tasks={filteredTasks} projects={projects} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} onStatus={(id, status) => setTasks(tasks.map(t => t.id === id ? { ...t, status } : t))}/>} {page === 'Tasks' && <TasksPage tasks={filteredTasks} projects={projects} onCreate={() => openCreate(todayIso())} onEdit={openEdit} onDelete={deleteTask}/>} {page === 'Projects' && <ProjectsPage projects={projects} tasks={tasks} setProjects={setProjects}/>} {page === 'PIC / Team' && <TeamPage pics={pics} setPics={setPics} tasks={tasks}/>} {page === 'Pengaturan' && <SettingsPage settings={settings} setSettings={setSettings} categories={categories} setCategories={setCategories} statuses={statuses} setStatuses={setStatuses} users={users} setUsers={setUsers} canManageUsers={canManageUsers}/>}</div>{drawerOpen && <TaskDrawer task={selectedTask} projects={projects} onClose={() => setDrawerOpen(false)} onEdit={openEdit} onDelete={deleteTask}/>}</div></section>{modalOpen && <TaskModal form={form} setForm={setForm} onClose={() => setModalOpen(false)} onSave={saveTask} projects={projects} pics={pics} categories={categories} statuses={statuses}/>}</main>;
}

function Header({ page, filter, setFilter, exportJson, currentUser, role, logout }: any) { return <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b bg-white/90 px-5 backdrop-blur lg:px-8"><div className="flex items-center gap-5"><button className="rounded-lg p-2 hover:bg-slate-100"><Menu size={20}/></button><div><h2 className="text-xl font-bold">{page}</h2><p className="text-sm text-slate-500">Kelola timeline project tim multimedia</p></div></div><div className="hidden w-96 items-center gap-2 rounded-xl border bg-white px-3 py-2 md:flex"><Search size={18} className="text-slate-400"/><input value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} placeholder="Cari task, project, PIC..." className="w-full outline-none" /></div><div className="flex items-center gap-3"><button onClick={exportJson} className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-100">Export</button><button onClick={logout} className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-100">Logout</button><div className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 font-bold">{currentUser?.name?.charAt(0) || 'U'}</div><div className="hidden text-sm md:block"><p className="font-semibold">{currentUser?.name}</p><p className="text-xs text-slate-500">{role}</p></div></div></header>; }
function KpiRow({ kpis }: { kpis: { total: number; progress: number; dueSoon: number } }) { return <div className="mb-5 grid gap-3 md:grid-cols-3"><Kpi title="Total Task" value={kpis.total}/><Kpi title="Progress" value={kpis.progress}/><Kpi title="Deadline ≤ 3 Hari" value={kpis.dueSoon} warning/></div>; }
function Kpi({ title, value, warning }: { title: string; value: number; warning?: boolean }) { return <div className="rounded-2xl border bg-white p-4 shadow-soft"><p className="text-sm text-slate-500">{title}</p><p className={`mt-1 text-2xl font-bold ${warning && value ? 'text-orange-600' : 'text-slate-900'}`}>{value}</p></div>; }
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (v: string) => void }) { return <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="mb-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm text-white outline-none [&_option]:text-slate-900">{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select>; }
function CalendarToolbar({ month, setMonth, nextMonth, view, setView, openCreate, zoom, setZoom }: any) { const years = Array.from({ length: 9 }, (_, i) => 2023 + i); return <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><button onClick={() => nextMonth(-1)} className="rounded-xl border bg-white p-3 hover:bg-slate-100"><ChevronLeft size={18}/></button><button onClick={() => nextMonth(1)} className="rounded-xl border bg-white p-3 hover:bg-slate-100"><ChevronRight size={18}/></button><button onClick={() => setMonth(new Date())} className="rounded-xl border bg-white px-4 py-3 font-semibold hover:bg-slate-100">Hari ini</button></div><div className="flex items-center gap-2"><select value={month.getMonth()} onChange={e => setMonth(new Date(month.getFullYear(), Number(e.target.value), 1))} className="rounded-xl border bg-white px-4 py-3 text-lg font-bold outline-none">{monthNames.map((m, i) => <option key={m} value={i}>{m}</option>)}</select><select value={month.getFullYear()} onChange={e => setMonth(new Date(Number(e.target.value), month.getMonth(), 1))} className="rounded-xl border bg-white px-4 py-3 text-lg font-bold outline-none">{years.map(y => <option key={y}>{y}</option>)}</select></div><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-xl border bg-white p-1">{viewButtons.map(v => <button key={v} onClick={() => setView(v)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === v ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>{v}</button>)}</div><label className="hidden items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm lg:flex">Zoom <input type="range" min="55" max="120" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}/></label><button onClick={() => openCreate(todayIso())} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-soft"><Plus size={18}/>Tambah Task</button></div></div>; }
function Legend({ projects }: { projects: Project[] }) { return <div className="mt-5 flex flex-wrap gap-5 text-sm text-slate-600">{projects.map(project => <span key={project.id} className="flex items-center gap-2"><i className="h-3 w-3 rounded-full" style={{ background: project.color }} />{project.name}</span>)}</div>; }

function CalendarView({ days, month, tasks, projects, onCreate, onSelect, onMove }: any) { return <div className="overflow-hidden rounded-2xl border bg-white shadow-soft"><div className="grid grid-cols-7 border-b bg-slate-50">{dayNames.map(day => <div key={day} className="p-4 text-center text-sm font-semibold">{day}</div>)}</div><div className="grid grid-cols-7">{days.map(day => <DayCell key={toIsoDate(day)} day={day} currentMonth={month} tasks={tasks} projects={projects} onCreate={onCreate} onSelect={onSelect} onMove={onMove}/>)}</div></div>; }
function DayCell({ day, currentMonth, tasks, projects, onCreate, onSelect, onMove, compact = false }: any) { const iso = toIsoDate(day); const dayTasks = tasks.filter((t: Task) => isTaskOnDate(t, iso)); const visible = dayTasks.slice(0, compact ? 2 : 4); return <div onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('text/plain'); if (id) onMove(id, iso); }} className={`calendar-cell border-b border-r p-3 ${sameMonth(day, currentMonth) ? 'bg-white' : 'bg-slate-50 text-slate-400'} ${compact ? 'min-h-[120px]' : ''}`}><div className="mb-2 flex items-center justify-between"><span className="font-semibold">{day.getDate()}</span><button onClick={() => onCreate(iso)} title="Tambah task di tanggal ini" className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700"><Plus size={17}/></button></div><div className="space-y-1.5">{visible.map((task: Task) => { const project = projectById(projects, task.projectId); const multi = (task.endDate || task.startDate) !== task.startDate; return <button key={task.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', task.id)} onClick={() => onSelect(task)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-xs font-medium leading-tight hover:brightness-95" style={{ background: tint(project.color), borderLeft: `3px solid ${project.color}` }}><span className="task-dot" style={{ background: project.color }} /><span className="truncate">{multi && iso !== task.startDate ? '↳ ' : ''}{task.title}</span></button>; })}{dayTasks.length > visible.length && <button onClick={() => onSelect(dayTasks[visible.length])} className="text-xs font-semibold text-slate-500">+ {dayTasks.length - visible.length} lagi</button>}</div></div>; }
function WeekView({ month, tasks, projects, onCreate, onSelect, onMove }: any) { const start = getMondayStart(month); const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; }); return <CalendarView days={days} month={month} tasks={tasks} projects={projects} onCreate={onCreate} onSelect={onSelect} onMove={onMove}/>; }
function QuarterView({ month, zoom, tasks, projects, onCreate, onSelect, onMove }: any) { const qStartMonth = Math.floor(month.getMonth() / 3) * 3; const months = [0, 1, 2].map(i => new Date(month.getFullYear(), qStartMonth + i, 1)); return <div className="overflow-x-auto rounded-2xl border bg-white p-4 shadow-soft"><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">Q{Math.floor(month.getMonth()/3)+1} {month.getFullYear()}</h3><p className="text-sm text-slate-500">Geser horizontal atau pakai slider zoom.</p></div><div className="flex gap-4" style={{ minWidth: `${zoom * 22}px` }}>{months.map(m => <div key={m.toISOString()} className="shrink-0" style={{ width: `${zoom * 9}px`, minWidth: 620 }}><h4 className="mb-3 text-center font-bold">{monthNames[m.getMonth()]}</h4><CalendarView days={getCalendarDays(m)} month={m} tasks={tasks} projects={projects} onCreate={onCreate} onSelect={onSelect} onMove={onMove}/></div>)}</div></div>; }
function TimelineView({ tasks, projects, onSelect }: { tasks: Task[]; projects: Project[]; onSelect: (task: Task) => void }) { return <div className="rounded-2xl border bg-white p-4 shadow-soft"><div className="space-y-6">{projects.map(project => { const list = tasks.filter(t => t.projectId === project.id).sort((a, b) => a.startDate.localeCompare(b.startDate)); if (!list.length) return null; return <section key={project.id}><h3 className="mb-3 flex items-center gap-2 font-bold"><i className="h-3 w-3 rounded-full" style={{ background: project.color }} />{project.name}</h3><div className="space-y-2">{list.map(task => <button key={task.id} onClick={() => onSelect(task)} className="flex w-full items-center justify-between rounded-xl border bg-slate-50 px-4 py-3 text-left hover:bg-white"><span className="font-semibold">{task.title}</span><span className="text-sm text-slate-500">{task.startDate} - {task.endDate || task.startDate} · {task.pic} · {task.status}</span></button>)}</div></section>; })}</div></div>; }
function GanttView({ month, tasks, projects, onSelect }: any) { const start = new Date(month.getFullYear(), month.getMonth(), 1); const total = 92; const scale = 12; return <div className="overflow-auto rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 text-lg font-bold">Gantt / Timeline 3 Bulan</h3><div style={{ minWidth: total * scale + 220 }}><div className="ml-[220px] grid" style={{ gridTemplateColumns: `repeat(${total}, ${scale}px)` }}>{Array.from({ length: total }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return <div key={i} className="border-l text-[10px] text-slate-400">{d.getDate() === 1 ? monthNames[d.getMonth()].slice(0,3) : ''}</div>; })}</div>{tasks.map(task => { const project = projectById(projects, task.projectId); const left = Math.max(0, Math.round((parseIso(task.startDate).getTime() - start.getTime()) / 86400000)); const width = Math.max(1, diffDays(task.startDate, task.endDate || task.startDate) + 1); return <div key={task.id} className="relative my-2 h-9"><div className="absolute left-0 top-1 w-[210px] truncate text-sm font-semibold">{task.title}</div><button onClick={() => onSelect(task)} className="absolute top-0 h-8 rounded-lg px-3 text-left text-xs font-semibold" style={{ left: 220 + left * scale, width: width * scale, minWidth: 80, background: tint(project.color), borderLeft: `4px solid ${project.color}` }}>{project.name}</button></div>; })}</div></div>; }
function KanbanView({ statuses, tasks, projects, onSelect, onStatus }: any) { return <div className="overflow-x-auto"><div className="flex gap-4 min-w-max">{statuses.map((status: string) => <div key={status} onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('text/plain'); if (id) onStatus(id, status); }} className="w-72 rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-3 font-bold">{status}</h3><div className="space-y-3">{tasks.filter((t: Task) => t.status === status).map((task: Task) => { const p = projectById(projects, task.projectId); return <button key={task.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', task.id)} onClick={() => onSelect(task)} className="w-full rounded-xl border p-3 text-left text-sm hover:bg-slate-50" style={{ borderLeft: `4px solid ${p.color}` }}><b>{task.title}</b><p className="mt-1 text-xs text-slate-500">{task.pic} · {task.startDate}</p></button>; })}</div></div>)}</div></div>; }
function TasksPage({ tasks, projects, onCreate, onEdit, onDelete }: any) { return <div className="rounded-2xl border bg-white p-4 shadow-soft"><div className="mb-4 flex justify-between"><h3 className="text-lg font-bold">Semua Task</h3><button onClick={onCreate} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Tambah Task</button></div><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-3">Task</th><th>Project</th><th>PIC</th><th>Tanggal</th><th>Status</th><th></th></tr></thead><tbody>{tasks.map((task: Task) => <tr key={task.id} className="border-b"><td className="p-3 font-semibold">{task.title}</td><td>{projectById(projects, task.projectId).name}</td><td>{task.pic}</td><td>{task.startDate} - {task.endDate || task.startDate}</td><td>{task.status}</td><td className="space-x-2 text-right"><button onClick={() => onEdit(task)} className="rounded-lg border px-3 py-1">Edit</button><button onClick={() => onDelete(task.id)} className="rounded-lg border border-red-200 px-3 py-1 text-red-600">Hapus</button></td></tr>)}</tbody></table></div></div>; }
function ProjectsPage({ projects, tasks, setProjects }: any) { const [name, setName] = useState(''); const add = () => { if (!name.trim()) return; setProjects([...projects, { id: name.toLowerCase().replace(/\s+/g, '-'), name, color: '#38bdf8', status: 'Active' }]); setName(''); }; return <div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 text-lg font-bold">Projects</h3><div className="mb-4 flex gap-2"><input value={name} onChange={e => setName(e.target.value)} placeholder="Nama project baru" className="input"/><button onClick={add} className="rounded-xl bg-blue-600 px-4 font-semibold text-white">Tambah</button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{projects.map((p: Project) => <div key={p.id} className="rounded-xl border p-4"><div className="mb-2 flex items-center gap-2"><i className="h-3 w-3 rounded-full" style={{ background: p.color }}/><b>{p.name}</b></div><p className="text-sm text-slate-500">{tasks.filter((t: Task) => t.projectId === p.id).length} task</p></div>)}</div></div>; }
function TeamPage({ pics, setPics, tasks }: any) { const [name, setName] = useState(''); const add = () => { if (!name.trim()) return; setPics([...pics, name.trim()]); setName(''); }; return <div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 text-lg font-bold">PIC / Team & Workload</h3><div className="mb-4 flex gap-2"><input value={name} onChange={e => setName(e.target.value)} placeholder="Nama PIC baru" className="input"/><button onClick={add} className="rounded-xl bg-blue-600 px-4 font-semibold text-white">Tambah</button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{pics.map((pic: string) => { const count = tasks.filter((t: Task) => t.pic === pic && t.status !== 'Done').length; return <div key={pic} className="rounded-xl border p-4"><b>{pic}</b><p className={`mt-1 text-sm ${count > 10 ? 'text-red-600' : 'text-slate-500'}`}>{count} task aktif {count > 10 && '· Overload'}</p></div>; })}</div></div>; }
function SettingsPage({ settings, setSettings, categories, setCategories, statuses, setStatuses, users, setUsers, canManageUsers }: any) { const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState('Member'); const addUser = () => { if (!canManageUsers || !email.trim() || !password.trim()) return; setUsers([...users, { id: uid('user'), email: email.trim().toLowerCase(), name: name.trim() || email.trim(), password: password.trim(), role, active: true, team: 'Multimedia' }]); setEmail(''); setName(''); setPassword(''); }; return <div className="grid gap-4 xl:grid-cols-2"><div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 text-lg font-bold">Workspace</h3><Field label="Nama Workspace"><input className="input" value={settings.workspaceName} onChange={e => setSettings({ ...settings, workspaceName: e.target.value })}/></Field><Field label="Timezone"><input className="input" value={settings.timezone} onChange={e => setSettings({ ...settings, timezone: e.target.value })}/></Field><Field label="Spreadsheet ID"><input className="input" value={settings.spreadsheetId || ''} onChange={e => setSettings({ ...settings, spreadsheetId: e.target.value })}/></Field></div><div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 text-lg font-bold">Status & Kategori</h3><ListEditor title="Status" items={statuses} setItems={setStatuses}/><ListEditor title="Kategori" items={categories} setItems={setCategories}/></div><div className="rounded-2xl border bg-white p-4 shadow-soft xl:col-span-2"><h3 className="mb-4 text-lg font-bold">Users & Role Access</h3>{canManageUsers && <div className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_1fr_160px_120px]"><input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@company.com"/><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Nama"/><input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password"/><select className="input" value={role} onChange={e=>setRole(e.target.value)}><option>Admin</option><option>Manager</option><option>Member</option><option>Viewer</option></select><button onClick={addUser} className="rounded-xl bg-blue-600 px-4 font-semibold text-white">Tambah</button></div>}<div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-3">Nama</th><th>Email</th><th>Password</th><th>Role</th><th>Active</th></tr></thead><tbody>{users.map((u: AppUser, idx: number) => <tr key={u.id} className="border-b"><td className="p-3 font-semibold">{u.name}</td><td>{u.email}</td><td>{canManageUsers ? <input className="w-32 rounded-lg border px-2 py-1" type="password" value={u.password || ''} onChange={e=>setUsers(users.map((x: AppUser, i: number)=> i===idx ? {...x, password:e.target.value} : x))}/> : '••••••'}</td><td>{canManageUsers ? <select className="rounded-lg border px-2 py-1" value={u.role} onChange={e=>setUsers(users.map((x: AppUser, i: number)=> i===idx ? {...x, role:e.target.value} : x))}><option>Admin</option><option>Manager</option><option>Member</option><option>Viewer</option></select> : u.role}</td><td>{canManageUsers ? <input type="checkbox" checked={u.active} onChange={e=>setUsers(users.map((x: AppUser, i: number)=> i===idx ? {...x, active:e.target.checked} : x))}/> : String(u.active)}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-slate-500">Role: Admin bisa semua, Manager upload/master data tanpa hapus user, Member tambah/edit task, Viewer hanya lihat/export. Untuk pengembangan awal, password disimpan di tab Users.</p></div></div>; }
function ListEditor({ title, items, setItems }: any) { const [val, setVal] = useState(''); return <div className="mb-5"><p className="mb-2 text-sm font-semibold text-slate-600">{title}</p><div className="mb-2 flex gap-2"><input className="input" value={val} onChange={e => setVal(e.target.value)} placeholder={`Tambah ${title}`}/><button onClick={() => { if (val.trim()) { setItems([...items, val.trim()]); setVal(''); } }} className="rounded-xl border px-4">Tambah</button></div><div className="flex flex-wrap gap-2">{items.map((x: string) => <span key={x} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{x}</span>)}</div></div>; }
function TaskDrawer({ task, projects, onClose, onEdit, onDelete }: any) { if (!task) return <aside className="border-l bg-white p-6"><button onClick={onClose} className="float-right"><X /></button><p className="mt-12 text-slate-500">Belum ada task dipilih.</p></aside>; const project = projectById(projects, task.projectId); const due = task.status !== 'Done' && parseIso(task.endDate || task.startDate).getTime() - new Date().getTime() <= 3 * 86400000; return <aside className="min-h-[calc(100vh-80px)] border-l bg-white p-6 shadow-soft"><div className="mb-8 flex items-center justify-between"><h3 className="text-lg font-bold">Detail Task</h3><button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X size={18}/></button></div><p className="mb-4 flex items-center gap-2 text-sm font-semibold" style={{ color: project.color }}><i className="h-3 w-3 rounded-full" style={{ background: project.color }} />{project.name}</p><h2 className="mb-4 text-2xl font-bold leading-tight">{task.title}</h2>{due && <div className="mb-4 flex gap-2 rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange-700"><AlertTriangle size={18}/>Deadline mendekat</div>}<Detail label="Tanggal" value={`${task.startDate}${task.endDate ? ` - ${task.endDate}` : ''}`} /><Detail label="Jam" value={`${task.startTime || '-'}${task.endTime ? ` - ${task.endTime}` : ''}`} /><Detail label="PIC" value={task.pic} /><Detail label="Status" value={task.status} /><Detail label="Kategori" value={task.category} /><Detail label="Deskripsi" value={task.notes || '-'} /><Detail label="Attachment / Link" value={task.link || '-'} /><div className="fixed bottom-0 right-0 flex w-full gap-3 border-t bg-white p-4 xl:w-[360px]"><button onClick={() => onEdit(task)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold hover:bg-slate-100"><Save size={16}/>Edit</button><button onClick={() => onDelete(task.id)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-600 hover:bg-red-50"><Trash2 size={16}/>Hapus</button></div></aside>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="mb-5 border-b pb-4"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="text-sm leading-relaxed text-slate-700">{value}</p></div>; }
function TaskModal({ form, setForm, onClose, onSave, projects, pics, categories, statuses }: any) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-soft"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">{form.id ? 'Edit Task' : 'Tambah Task'}</h2><button onClick={onClose}><X /></button></div><div className="grid gap-3 md:grid-cols-2"><Field className="md:col-span-2" label="Judul task"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Contoh: Presentasi Internal Video" className="input" /></Field><Field label="Project"><select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="input">{projects.map((project: Project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field><Field label="PIC"><select value={form.pic} onChange={(e) => setForm({ ...form, pic: e.target.value })} className="input">{pics.map((pic: string) => <option key={pic}>{pic}</option>)}</select></Field><Field label="Tanggal mulai"><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" /></Field><Field label="Tanggal selesai"><input type="date" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input" /></Field><Field label="Jam mulai"><input type="time" value={form.startTime || ''} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="input" /></Field><Field label="Jam selesai"><input type="time" value={form.endTime || ''} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="input" /></Field><Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })} className="input">{statuses.map((status: string) => <option key={status}>{status}</option>)}</select></Field><Field label="Kategori"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">{categories.map((category: string) => <option key={category}>{category}</option>)}</select></Field><Field className="md:col-span-2" label="Catatan"><textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-24" /></Field><Field className="md:col-span-2" label="Link"><input value={form.link || ''} onChange={(e) => setForm({ ...form, link: e.target.value })} className="input" /></Field></div><div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="rounded-xl border px-5 py-3 font-semibold">Batal</button><button onClick={onSave} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Simpan Task</button></div></div></div>; }
function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`mb-3 block ${className}`}><span className="mb-1 block text-sm font-semibold text-slate-600">{label}</span>{children}</label>; }
