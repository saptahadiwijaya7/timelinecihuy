'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Folder, LayoutDashboard, ListTodo, Menu, Plus, Search, Settings, Trash2, Users, X, Download, Upload, Save, KanbanSquare, AlertTriangle, Archive, MapPin, Link2, RotateCcw, Banknote, Bell, BarChart3, Bot, Send, Sparkles, Video } from 'lucide-react';
import { categories as defaultCategories, pics as defaultPics, projects as defaultProjects, requesters as defaultRequesters, seedTasks, settings as defaultSettings, statuses as defaultStatuses, users as defaultUsers } from '@/lib/data';
import { AppUser, Pic, Project, ProjectFlag, SheetData, Status, Task, TaskPayload, WorkspaceSettings } from '@/lib/types';

const STORAGE_KEY = 'timeline-project-suite-v4';
const USER_KEY = 'timeline-project-current-user';
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const viewButtons = ['Bulan', 'Minggu', 'Quarter', 'Timeline', 'Gantt'] as const;
type View = typeof viewButtons[number];
type Page = 'Dashboard' | 'Kalender' | 'Timeline' | 'Kanban' | 'Tasks' | 'Projects' | 'PIC / Team' | 'Pengaturan';
type Filter = { projectId: string; pic: string; status: string; category: string; search: string; projectStatus: string };
type FormState = TaskPayload;
const emptyFilter: Filter = { projectId: 'all', pic: 'all', status: 'all', category: 'all', search: '', projectStatus: 'all' };

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
function defaultForm(date: string): FormState { return { title: '', projectId: 'campaign', pic: 'Admin', startDate: date, endDate: date, startTime: '', endTime: '', status: 'Planned', statusMode: 'auto', category: 'Briefing', notes: '', link: '', invite: '', meetLink: '', calendarEventId: '' }; }
function projectById(projects: Project[], id: string) { return projects.find((project) => project.id === id) ?? projects[projects.length - 1]; }

type StatusStyle = { text: string; bg: string; card: string; dot: string };
const STATUS_META: Record<string, StatusStyle> = {
  Planned:  { text: '#475569', bg: '#e2e8f0', card: '#f8fafc', dot: '#94a3b8' },
  Progress: { text: '#1d4ed8', bg: '#dbeafe', card: '#eff6ff', dot: '#3b82f6' },
  Waiting:  { text: '#b45309', bg: '#fef3c7', card: '#fffbeb', dot: '#f59e0b' },
  Review:   { text: '#7c3aed', bg: '#ede9fe', card: '#f5f3ff', dot: '#8b5cf6' },
  Done:     { text: '#15803d', bg: '#dcfce7', card: '#f0fdf4', dot: '#22c55e' },
  Canceled: { text: '#b91c1c', bg: '#fee2e2', card: '#fef2f2', dot: '#ef4444' },
  Overdue:  { text: '#be123c', bg: '#ffe4e6', card: '#fff1f2', dot: '#f43f5e' }
};
const FALLBACK_STATUS: StatusStyle = { text: '#475569', bg: '#e2e8f0', card: '#f8fafc', dot: '#94a3b8' };
function statusMeta(status: string): StatusStyle { return STATUS_META[status] || FALLBACK_STATUS; }
// Auto mode: status mengikuti tanggal. Manual mode: pakai status tersimpan.
function effectiveStatus(task: Task): string {
  if (task.statusMode === 'auto') { const today = todayIso(); return task.startDate && today < task.startDate ? 'Planned' : 'Progress'; }
  return task.status;
}
function isOverdue(task: Task): boolean { const eff = effectiveStatus(task); if (eff === 'Done' || eff === 'Canceled') return false; const end = task.endDate || task.startDate; return !!end && end < todayIso(); }
function displayStatus(task: Task): string { return isOverdue(task) ? 'Overdue' : effectiveStatus(task); }

/* ===== Helper Project ===== */
function projectProgress(tasks: Task[], projectId: string) {
  const list = tasks.filter((t) => t.projectId === projectId);
  const active = list.filter((t) => effectiveStatus(t) !== 'Canceled');
  const done = active.filter((t) => effectiveStatus(t) === 'Done').length;
  return { total: list.length, active: active.length, done, pct: active.length ? Math.round((done / active.length) * 100) : 0 };
}
function formatRupiah(v: number | string | undefined) { const n = Number(v || 0); if (!n) return 'Rp 0'; return 'Rp ' + n.toLocaleString('id-ID'); }
function parseRupiahInput(s: string) { return Number(String(s).replace(/[^0-9]/g, '')) || 0; }
// Ekstrak nama tempat dari link Google Maps agar bisa ditampilkan sebagai teks yang diklik.
function gmapsName(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const place = u.pathname.match(/\/place\/([^\/]+)/);
    if (place) return decodeURIComponent(place[1]).replace(/\+/g, ' ');
    const q = u.searchParams.get('q') || u.searchParams.get('query');
    if (q) return decodeURIComponent(q).replace(/\+/g, ' ');
    return u.hostname.includes('goo.gl') || u.hostname.includes('maps.app') ? 'Lihat di Google Maps' : url;
  } catch { return url; }
}
function isArchived(p: Project) { return p.archived === true || String(p.archived).toLowerCase() === 'true'; }
function normProjectStatus(p: Project) { const s = String(p.status || 'Active').toLowerCase(); if (s.startsWith('done') || s.startsWith('selesai')) return 'Done'; if (s.startsWith('cancel')) return 'Cancel'; return 'Active'; }
const PROJECT_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  Active: { label: 'Aktif', bg: '#dbeafe', text: '#1d4ed8' },
  Done: { label: 'Done', bg: '#dcfce7', text: '#15803d' },
  Cancel: { label: 'Cancel', bg: '#fee2e2', text: '#b91c1c' }
};
const FLAG_META: Record<string, { bg: string; text: string }> = {
  Big: { bg: '#fee2e2', text: '#b91c1c' },
  Medium: { bg: '#fef3c7', text: '#b45309' },
  Small: { bg: '#e2e8f0', text: '#475569' }
};
// Kompres gambar jadi thumbnail kecil (data URL) agar muat di sel Google Sheet.
function fileToThumbnail(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal baca file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar valid'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = size / Math.min(img.width, img.height);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        // crop tengah jadi square
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
function normalizePics(arr: any[]): Pic[] { return (arr || []).map((p: any) => typeof p === 'string' ? { name: p } : p).filter((p: Pic) => p && p.name); }
const TIME_OPTIONS = (() => { const a: string[] = []; for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) a.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`); return a; })();
function emptyProjectForm(): Project { return { id: '', name: '', color: '#38bdf8', status: 'Active', startMonth: new Date().toISOString().slice(0, 7), requester: '', pic: '', outputLandscape: '', outputVertical: '', distribusi: '', lokasi1: '', lokasi2: '', folderLink: '', budget: '', actualCost: '', flag: '', thumbnail: '', notes: '', archived: false }; }

function StatusControl({ task, statuses, onChange, editable }: { task: Task; statuses: string[]; onChange: (patch: Partial<Task>) => void; editable: boolean }) {
  const label = displayStatus(task);
  const meta = statusMeta(label);
  const auto = task.statusMode === 'auto';
  const chip = (extra = '') => <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${extra}`} style={{ background: meta.bg, color: meta.text }}><i className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />{label}{auto && <span className="opacity-60">· auto</span>}</span>;
  if (!editable) return chip();
  const value = auto ? '__auto__' : task.status;
  return (
    <span className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <select value={value} onChange={(e) => { const v = e.target.value; onChange(v === '__auto__' ? { statusMode: 'auto' } : { statusMode: 'manual', status: v }); }} className="cursor-pointer appearance-none rounded-full py-1 pl-2.5 pr-7 text-xs font-semibold outline-none ring-1 ring-inset ring-black/5" style={{ background: meta.bg, color: meta.text }} aria-label="Ubah status">
        <option value="__auto__">🔄 Otomatis (tanggal)</option>
        {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-2" style={{ color: meta.text }} />
    </span>
  );
}
function StatusLegend({ statuses }: { statuses: string[] }) { const items = [...statuses, 'Overdue']; return <div className="flex flex-wrap gap-3 text-xs text-slate-500">{items.map((s) => { const m = statusMeta(s); return <span key={s} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: m.dot }} />{s}</span>; })}</div>; }


export default function Home() {
  const [month, setMonth] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [projects, setProjects] = useState<Project[]>(defaultProjects);
  const [pics, setPics] = useState<Pic[]>(defaultPics);
  const [requesters, setRequesters] = useState<string[]>(defaultRequesters);
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
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<Project>(emptyProjectForm());
  const [form, setForm] = useState<FormState>(() => defaultForm(todayIso()));
  const [filter, setFilter] = useState<Filter>(emptyFilter);
  const [view, setView] = useState<View>('Bulan');
  const [page, setPage] = useState<Page>('Kalender');
  const [syncMessage, setSyncMessage] = useState('Menyiapkan data workspace...');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [zoom, setZoom] = useState(80);
  const pollingRef = useRef(false);
  const metaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaInitRef = useRef(false);
  const lastEditRef = useRef(0);
  const metaDirtyRef = useRef(false);

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
          setPics(data.pics?.length ? normalizePics(data.pics) : defaultPics);
          setCategories(data.categories || defaultCategories);
          setStatuses(data.statuses || defaultStatuses);
          setRequesters(data.requesters || defaultRequesters);
          setSettings(data.settings || defaultSettings);
          setUsers(data.users || defaultUsers);
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
          pics: data.pics?.length ? normalizePics(data.pics) : defaultPics,
          categories: data.categories?.length ? data.categories : defaultCategories,
          statuses: data.statuses?.length ? data.statuses : defaultStatuses,
          requesters: data.requesters?.length ? data.requesters : defaultRequesters,
          settings: data.settings || defaultSettings,
          users: data.users?.length ? data.users : defaultUsers
        };
        setTasks(nextData.tasks);
        setProjects(nextData.projects);
        setPics(nextData.pics);
        setCategories(nextData.categories);
        setStatuses(nextData.statuses);
        setRequesters(nextData.requesters);
        setSettings(nextData.settings);
        setUsers(nextData.users);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, projects, pics, categories, statuses, requesters, settings, users: users.map(({ password, ...u }) => u) }));
  }, [tasks, projects, pics, categories, statuses, requesters, settings, users]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const project = projectById(projects, task.projectId);
    const q = filter.search.toLowerCase();
    const matchesSearch = !q || [task.title, task.pic, task.category, project.name, task.status, task.notes].join(' ').toLowerCase().includes(q);
    const pStatusOk = filter.projectStatus === 'all' || normProjectStatus(project) === filter.projectStatus;
    return matchesSearch && pStatusOk && (filter.projectId === 'all' || task.projectId === filter.projectId) && (filter.pic === 'all' || task.pic === filter.pic) && (filter.status === 'all' || task.status === filter.status) && (filter.category === 'all' || task.category === filter.category);
  }), [tasks, projects, filter]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? null;
  const days = getCalendarDays(month);
  const picNames = useMemo(() => pics.map((p) => p.name), [pics]);
  const buildAiContext = () => {
    const projName = (id: string) => projectById(projects, id)?.name || id;
    const activeProjects = projects.filter((p) => !isArchived(p));
    const lines: string[] = [];
    lines.push(`Tanggal hari ini: ${todayIso()}`);
    lines.push(`Total: ${tasks.length} task, ${activeProjects.length} project aktif, ${pics.length} PIC.`);
    const reqList = Array.from(new Set(activeProjects.map((p) => p.requester).filter(Boolean)));
    lines.push(`\nDAFTAR REQUESTER (peminta project) yang terpakai: ${reqList.length ? reqList.join(', ') : '(belum ada project yang mengisi requester)'}`);
    lines.push('\nPROJECT (nama | status | requester | picProject | mulai | budget | realisasi | outputLandscape | outputVertical | distribusi | lokasi1 | lokasi2 | folderDrive | skala | progress | catatan):');
    activeProjects.forEach((p) => { const pr = projectProgress(tasks, p.id); lines.push(`- ${p.name} | ${normProjectStatus(p)} | requester:${p.requester || '-'} | picProject:${p.pic || '-'} | ${p.startMonth || '-'} | ${formatRupiah(p.budget)} | ${formatRupiah(p.actualCost)} | L:${Number(p.outputLandscape) || 0} | V:${Number(p.outputVertical) || 0} | distribusi:${p.distribusi || '-'} | lok1:${p.lokasi1 ? gmapsName(p.lokasi1) : '-'} | lok2:${p.lokasi2 ? gmapsName(p.lokasi2) : '-'} | folder:${p.folderLink ? 'ada' : '-'} | ${p.flag || '-'} | ${pr.done}/${pr.active} (${pr.pct}%) | catatan:${(p.notes || '-').replace(/\s+/g, ' ').slice(0, 140)}`); });
    lines.push('\nTASK (judul | project | pic | status | kategori | mulai..selesai | overdue | punyaLink):');
    tasks.forEach((t) => { lines.push(`- ${t.title} | ${projName(t.projectId)} | ${t.pic || '-'} | ${displayStatus(t)} | ${t.category || '-'} | ${t.startDate}..${t.endDate || t.startDate} | ${isOverdue(t) ? 'YA' : 'tidak'} | ${t.link ? 'ada' : 'tidak'}`); });
    lines.push('\nPIC (nama | role | jumlahTaskAktifTotal):');
    pics.forEach((pic) => { const c = tasks.filter((t) => t.pic === pic.name && effectiveStatus(t) !== 'Canceled' && effectiveStatus(t) !== 'Done').length; lines.push(`- ${pic.name} | ${pic.role || '-'} | ${c}`); });
    return lines.join('\n');
  };
  const currentUser = useMemo(() => users.find(u => u.active && u.email.toLowerCase() === (currentEmail || '').toLowerCase()) || null, [users, currentEmail]);
  const role = currentUser?.role || 'Guest';
  const canCreate = ['Admin', 'Manager', 'Member'].includes(role);
  const canManage = ['Admin', 'Manager'].includes(role);
  const canDelete = role === 'Admin';
  const canManageUsers = role === 'Admin';

  async function apiPost(body: any) {
    lastEditRef.current = Date.now();
    const res = await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.message || 'Permintaan gagal');
    return data;
  }
  function persistTask(task: Task) {
    apiPost({ action: 'upsertTask', task })
      .then((res) => {
        const rt = res && res.task;
        if (rt) { setTasks((cur) => cur.map((t) => t.id === rt.id ? { ...t, meetLink: rt.meetLink || '', calendarEventId: rt.calendarEventId || '' } : t)); }
        if (rt && rt._calendarWarning) setSyncMessage(`Task tersimpan, tapi sinkron kalender gagal (event tetap bisa dibuat manual). Detail: ${String(rt._calendarWarning).slice(0, 120)}`);
        else if (rt && rt.meetLink) setSyncMessage(`Tersimpan + event "Timeline Meetings" dibuat, link Meet siap.`);
        else if (rt && rt.calendarEventId) setSyncMessage(`Tersimpan + event kalender dibuat (tanpa link Meet otomatis).`);
        else setSyncMessage(`Tersimpan: "${task.title}" (${new Date().toLocaleTimeString('id-ID')}).`);
      })
      .catch((err) => setSyncMessage(`Gagal simpan task: ${err instanceof Error ? err.message : 'error'}`));
  }
  function applyRemote(data: any) {
    setTasks(data.tasks || []);
    setProjects(data.projects?.length ? data.projects : defaultProjects);
    setPics(data.pics?.length ? normalizePics(data.pics) : defaultPics);
    setCategories(data.categories?.length ? data.categories : defaultCategories);
    setStatuses(data.statuses?.length ? data.statuses : defaultStatuses);
    setRequesters(data.requesters?.length ? data.requesters : defaultRequesters);
    setSettings(data.settings || defaultSettings);
    setUsers(data.users?.length ? data.users : defaultUsers);
  }

  // Simpan master data LANGSUNG (tanpa debounce). `patch` berisi nilai baru sehingga tidak
  // bergantung pada timing update state React. Nilai lain diambil dari state saat ini.
  function saveMetaNow(patch: Partial<{ pics: Pic[]; categories: string[]; statuses: string[]; requesters: string[]; settings: WorkspaceSettings }>) {
    if (!canManage) { setSyncMessage('Akses ditolak: hanya Admin/Manager yang bisa ubah master data.'); return; }
    metaDirtyRef.current = true; lastEditRef.current = Date.now();
    apiPost({ action: 'writeMeta', pics, categories, statuses, requesters, settings, ...patch })
      .then(() => setSyncMessage(`Master data tersimpan (${new Date().toLocaleTimeString('id-ID')}).`))
      .catch((err) => setSyncMessage(`Gagal simpan master data: ${err instanceof Error ? err.message : 'error'}`))
      .finally(() => { metaDirtyRef.current = false; });
  }
  const updatePics = (next: Pic[]) => { setPics(next); saveMetaNow({ pics: next }); };
  const updateCategories = (next: string[]) => { setCategories(next); saveMetaNow({ categories: next }); };
  const updateStatuses = (next: string[]) => { setStatuses(next); saveMetaNow({ statuses: next }); };
  const updateRequesters = (next: string[]) => { setRequesters(next); saveMetaNow({ requesters: next }); };
  const updateSettings = (next: WorkspaceSettings) => { setSettings(next); saveMetaNow({ settings: next }); };

  function openCreate(date: string) { if (!canCreate) { setSyncMessage('Akses ditolak: role kamu hanya bisa melihat data.'); return; } setForm(defaultForm(date)); setModalOpen(true); }
  function openEdit(task: Task) { setForm({ ...task, endDate: task.endDate || task.startDate }); setSelectedTaskId(task.id); setModalOpen(true); setDrawerOpen(true); }
  function saveTask() {
    if (!canCreate) { setSyncMessage('Akses ditolak: tidak boleh menambah/edit task.'); return; }
    if (!form.title.trim()) return;
    const now = new Date().toISOString();
    const isNew = !form.id;
    const id = form.id || uid();
    const task = { ...form, id, endDate: form.endDate || form.startDate, createdAt: form.createdAt || now, updatedAt: now } as Task;
    setTasks((current) => isNew ? [...current, task] : current.map((t) => t.id === id ? task : t));
    setSelectedTaskId(id);
    setModalOpen(false);
    persistTask(task);
  }
  function deleteTask(id: string) {
    if (!canDelete) { setSyncMessage('Akses ditolak: hanya Admin yang bisa hapus task.'); return; }
    setTasks((current) => current.filter((task) => task.id !== id));
    if (selectedTaskId === id) setSelectedTaskId(null);
    apiPost({ action: 'deleteTask', id }).then(() => setSyncMessage('Task dihapus.')).catch((err) => setSyncMessage(`Gagal hapus task: ${err instanceof Error ? err.message : 'error'}`));
  }
  function changeStatus(id: string, patch: Partial<Task>) {
    if (!canCreate) { setSyncMessage('Akses ditolak: role kamu hanya bisa melihat data.'); return; }
    const target = tasks.find((t) => t.id === id); if (!target) return;
    const updated = { ...target, ...patch, updatedAt: new Date().toISOString() } as Task;
    setTasks((current) => current.map((t) => t.id === id ? updated : t));
    persistTask(updated);
  }
  function moveTaskDate(taskId: string, newStart: string) {
    if (!canCreate) { setSyncMessage('Akses ditolak: role kamu hanya bisa melihat data.'); return; }
    const target = tasks.find((t) => t.id === taskId); if (!target) return;
    const span = diffDays(target.startDate, target.endDate || target.startDate);
    const updated = { ...target, startDate: newStart, endDate: addDays(newStart, span), updatedAt: new Date().toISOString() } as Task;
    setTasks((current) => current.map((t) => t.id === taskId ? updated : t));
    persistTask(updated);
  }
  function nextMonth(step: number) { setMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1)); }
  function switchPage(label: Page) { setPage(label); if (label === 'Kalender') setView('Bulan'); if (label === 'Timeline') setView('Timeline'); if (label === 'Projects' || label === 'PIC / Team' || label === 'Pengaturan' || label === 'Dashboard') setDrawerOpen(false); }
  function exportJson() { const blob = new Blob([JSON.stringify({ tasks, projects, pics, categories, statuses, settings }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'timeline-project-data.json'; a.click(); URL.revokeObjectURL(url); }

  // Kelola user (Admin). Password ditangani di server; client tidak pernah memegang password.
  function saveUser(user: AppUser, newPassword?: string) {
    if (!canManageUsers) { setSyncMessage('Akses ditolak: hanya Admin yang kelola user.'); return; }
    apiPost({ action: 'upsertUser', user: { id: user.id, email: user.email, name: user.name, role: user.role, active: user.active, team: user.team }, newPassword: newPassword || undefined })
      .then((data) => { const pu = data.user as AppUser; setUsers((cur) => cur.some((u) => u.id === pu.id) ? cur.map((u) => u.id === pu.id ? pu : u) : [...cur, pu]); setSyncMessage(`User "${pu.name}" tersimpan.`); })
      .catch((err) => setSyncMessage(`Gagal simpan user: ${err instanceof Error ? err.message : 'error'}`));
  }
  function removeUser(id: string) {
    if (!canManageUsers) { setSyncMessage('Akses ditolak: hanya Admin yang kelola user.'); return; }
    setUsers((cur) => cur.filter((u) => u.id !== id));
    apiPost({ action: 'deleteUser', id }).then(() => setSyncMessage('User dihapus.')).catch((err) => setSyncMessage(`Gagal hapus user: ${err instanceof Error ? err.message : 'error'}`));
  }

  /* ===== Project CRUD (per-baris) ===== */
  function persistProject(p: Project) {
    apiPost({ action: 'upsertProject', project: p })
      .then(() => setSyncMessage(`Project "${p.name}" tersimpan (${new Date().toLocaleTimeString('id-ID')}).`))
      .catch((err) => setSyncMessage(`Gagal simpan project: ${err instanceof Error ? err.message : 'error'}`));
  }
  function openCreateProject() { if (!canManage) { setSyncMessage('Akses ditolak: hanya Admin/Manager yang kelola project.'); return; } setProjectForm(emptyProjectForm()); setProjectModalOpen(true); }
  function openEditProject(p: Project) { if (!canManage) { setSyncMessage('Akses ditolak: hanya Admin/Manager yang kelola project.'); return; } setProjectForm({ ...emptyProjectForm(), ...p }); setProjectModalOpen(true); }
  function saveProject() {
    if (!canManage) { setSyncMessage('Akses ditolak.'); return; }
    if (!projectForm.name.trim()) { setSyncMessage('Nama project wajib diisi.'); return; }
    const isNew = !projectForm.id;
    const id = projectForm.id || projectForm.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36);
    const p = { ...projectForm, id, budget: parseRupiahInput(String(projectForm.budget ?? '')), actualCost: parseRupiahInput(String(projectForm.actualCost ?? '')) } as Project;
    setProjects((cur) => isNew ? [...cur, p] : cur.map((x) => x.id === id ? p : x));
    setProjectModalOpen(false);
    persistProject(p);
  }
  function setProjectArchived(id: string, archived: boolean) {
    if (!canManage) { setSyncMessage('Akses ditolak.'); return; }
    const target = projects.find((x) => x.id === id); if (!target) return;
    const p = { ...target, archived } as Project;
    setProjects((cur) => cur.map((x) => x.id === id ? p : x));
    setProjectModalOpen(false);
    persistProject(p);
    setSyncMessage(archived ? `Project "${p.name}" diarsipkan.` : `Project "${p.name}" dipulihkan.`);
  }
  function deleteProjectPermanent(id: string) {
    if (!canDelete) { setSyncMessage('Akses ditolak: hanya Admin yang bisa hapus permanen.'); return; }
    const target = projects.find((x) => x.id === id);
    if (target && !isArchived(target)) { setSyncMessage('Arsipkan project dulu sebelum hapus permanen.'); return; }
    setProjects((cur) => cur.filter((x) => x.id !== id));
    apiPost({ action: 'deleteProject', id }).then(() => setSyncMessage('Project dihapus permanen.')).catch((err) => setSyncMessage(`Gagal hapus project: ${err instanceof Error ? err.message : 'error'}`));
  }

  function renamePic(from: string, to: string) {
    if (!from || !to || from === to) return;
    setTasks((cur) => cur.map((t) => t.pic === from ? { ...t, pic: to } : t));
    apiPost({ action: 'renamePic', from, to })
      .then((d) => setSyncMessage(`PIC "${from}" jadi "${to}" - ${d.updated ?? 0} task ikut diperbarui.`))
      .catch((err) => setSyncMessage(`Gagal update task saat rename PIC: ${err instanceof Error ? err.message : 'error'}`));
  }

  async function syncFromSheet() {
    setSyncMessage('Mengambil data dari Google Sheet...');
    try { const res = await fetch('/api/data', { cache: 'no-store' }); const data = await res.json(); if (!res.ok || !data.tasks) throw new Error(data.message || 'Gagal sync'); applyRemote(data); setSyncMessage(`Berhasil refresh ${data.tasks.length} task dari Google Sheet.`); }
    catch (err) { setSyncMessage(err instanceof Error ? err.message : 'Gagal sync Google Sheet.'); }
  }
  async function pushToSheet() {
    if (!canManage) { setSyncMessage('Akses ditolak: hanya Admin/Manager yang bisa sinkron penuh.'); return; }
    setSyncMessage('Sinkron penuh (task + master data) ke Google Sheet...');
    try { await apiPost({ action: 'writeAll', tasks, projects, pics, categories, statuses, requesters, settings }); setSyncMessage(`Sinkron penuh berhasil (${new Date().toLocaleTimeString('id-ID')}).`); }
    catch (err) { setSyncMessage(err instanceof Error ? err.message : 'Gagal sinkron penuh.'); }
  }

  // Master data disimpan langsung lewat saveMetaNow (updatePics/updateCategories/dst) — bukan lagi via debounce effect.

  // Auto refresh dari sheet untuk melihat perubahan user lain. Ditunda saat modal edit terbuka.
  useEffect(() => {
    if (!currentUser) return;
    const interval = window.setInterval(async () => {
      // Jangan timpa data lokal saat: sedang polling, ada modal terbuka, penyimpanan master data pending,
      // atau baru saja ada editan (beri jeda 8 detik agar penyimpanan sempat selesai lebih dulu).
      if (pollingRef.current || modalOpen || projectModalOpen || metaDirtyRef.current || Date.now() - lastEditRef.current < 8000) return;
      pollingRef.current = true;
      try { const res = await fetch('/api/data', { cache: 'no-store' }); const data = await res.json(); if (res.ok && data.tasks) applyRemote(data); }
      catch { /* koneksi sementara; abaikan */ }
      finally { pollingRef.current = false; }
    }, 20000);
    return () => window.clearInterval(interval);
  }, [currentUser, modalOpen, projectModalOpen]);

  // Drawer detail task tertutup otomatis saat klik di luar drawer atau tekan Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onDown = (e: MouseEvent) => { const t = e.target as HTMLElement; if (t && !t.closest('[data-drawer]')) setDrawerOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [drawerOpen]);

  /* ===== 4. Notifikasi (Finance H-3..H + task hari ini) ===== */
  const notifItems = useMemo(() => {
    const today = todayIso();
    const items: { task: Task; kind: 'finance' | 'today'; diff: number }[] = [];
    tasks.forEach((t) => {
      const eff = effectiveStatus(t);
      if (eff === 'Done' || eff === 'Canceled') return;
      const due = t.endDate || t.startDate;
      if (!due) return;
      const d = Math.round((parseIso(due).getTime() - parseIso(today).getTime()) / 86400000);
      if (String(t.category || '').toLowerCase() === 'finance' && d >= 0 && d <= 3) items.push({ task: t, kind: 'finance', diff: d });
      else if (isTaskOnDate(t, today)) items.push({ task: t, kind: 'today', diff: 0 });
    });
    return items.sort((x, y) => x.diff - y.diff || (x.kind === 'finance' ? -1 : 1));
  }, [tasks]);
  const notifSig = useMemo(() => notifItems.map((i) => `${i.kind}:${i.task.id}:${i.diff}`).join('|'), [notifItems]);
  const [notifSeenSig, setNotifSeenSig] = useState('__init__');
  useEffect(() => { setNotifSeenSig(window.localStorage.getItem('timeline-notif-seen') || ''); }, []);
  const unreadCount = notifSeenSig !== '__init__' && notifSig && notifSig !== notifSeenSig ? notifItems.length : 0;
  function markNotifSeen() { setNotifSeenSig(notifSig); window.localStorage.setItem('timeline-notif-seen', notifSig); }
  const lastChimeRef = useRef(0);
  function playChime() {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.resume) ctx.resume();
      const note = (freq: number, start: number, dur: number) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination); const t0 = ctx.currentTime + start; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.start(t0); o.stop(t0 + dur + 0.05); };
      note(987.77, 0, 0.7); // "ting"
      note(659.25, 0.35, 1.0); // "nong"
      setTimeout(() => { try { ctx.close(); } catch {} }, 2200);
    } catch { /* audio tidak tersedia */ }
  }
  // Bunyikan lonceng saat ada notifikasi belum dibaca, ulang tiap 30 menit selama belum dibuka.
  useEffect(() => {
    if (!currentUser) return;
    const check = () => {
      if (unreadCount > 0 && settings.notifSound !== 'off' && Date.now() - lastChimeRef.current >= 30 * 60 * 1000) {
        lastChimeRef.current = Date.now();
        playChime();
      }
    };
    check();
    const iv = window.setInterval(check, 60000);
    return () => window.clearInterval(iv);
  }, [unreadCount, settings.notifSound, currentUser]);

  const kpis = useMemo(() => ({ total: filteredTasks.length, progress: filteredTasks.filter(t => effectiveStatus(t) === 'Progress').length, overdue: filteredTasks.filter(t => isOverdue(t)).length, dueSoon: filteredTasks.filter(t => { const end = parseIso(t.endDate || t.startDate).getTime(); const now = new Date(); return end >= now.getTime() && end - now.getTime() <= 3 * 86400000 && effectiveStatus(t) !== 'Done'; }).length }), [filteredTasks]);
  async function login() {
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    if (!email || !password) { setSyncMessage('Email dan password wajib diisi.'); return; }
    setSyncMessage('Memverifikasi login...');
    try {
      const data = await apiPost({ action: 'login', email, password });
      if (!data.user) throw new Error(data.message || 'Login gagal');
      const pu = data.user as AppUser;
      setUsers((cur) => cur.some((u) => u.id === pu.id) ? cur.map((u) => u.id === pu.id ? pu : u) : [...cur, pu]);
      window.localStorage.setItem(USER_KEY, pu.email);
      setCurrentEmail(pu.email);
      setLoginPassword('');
      setSyncMessage(`Login sebagai ${pu.name} (${pu.role}).`);
    } catch (err) { setSyncMessage(err instanceof Error ? err.message : 'Login gagal.'); }
  }
  function logout() { window.localStorage.removeItem(USER_KEY); setCurrentEmail(null); setLoginEmail(''); setLoginPassword(''); }

  if (isBootstrapping) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="w-full max-w-md rounded-3xl border bg-white p-8 text-center shadow-soft"><div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600"><CalendarDays size={34}/></div><h1 className="text-2xl font-bold">Timeline Project</h1><p className="mt-2 text-sm text-slate-500">Loading workspace, users, dan data terbaru dari Google Sheet...</p><div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600" /></div><p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">{syncMessage}</p></section></main>;

  if (!currentUser) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="w-full max-w-lg rounded-3xl border bg-white p-8 shadow-soft"><div className="mb-6 flex items-center gap-3"><CalendarDays size={36} className="text-blue-600"/><div><h1 className="text-2xl font-bold">{settings.workspaceName}</h1><p className="text-sm text-slate-500">Login internal. Users otomatis dimuat dari Google Sheet</p></div></div><label className="mb-2 block text-sm font-semibold text-slate-600">Email</label><input className="input mb-4" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="branding@cpssoft.com"/><label className="mb-2 block text-sm font-semibold text-slate-600">Password</label><input type="password" className="input mb-4" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') login(); }} placeholder="Masukkan password"/><button onClick={login} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Masuk</button><p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">{syncMessage}</p><p className="mt-4 text-xs text-slate-500">Akses diatur dari tab <b>Users</b>: Admin, Manager, Member, Viewer. Demo: admin@example.com / admin123, manager@example.com / manager123, member@example.com / member123, viewer@example.com / viewer123.</p></section></main>;

  return <main className="min-h-screen bg-slate-50">
    <aside className="fixed left-0 top-0 z-20 hidden h-screen w-72 flex-col bg-slate-950 text-white lg:flex">
      <div className="flex items-center gap-3 px-6 py-6"><CalendarDays size={34}/><div><h1 className="text-xl font-bold">{settings.workspaceName}</h1><p className="text-sm text-slate-300">Multimedia Team</p></div></div>
      <nav className="px-4 text-sm font-medium">{([['Dashboard', BarChart3], ['Kalender', CalendarDays], ['Timeline', LayoutDashboard], ['Kanban', KanbanSquare], ['Tasks', ListTodo], ['Projects', Folder], ['PIC / Team', Users], ['Pengaturan', Settings]] as any).map(([label, Icon]: [Page, any]) => <button key={label} onClick={() => switchPage(label)} className={`mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${page === label ? 'bg-blue-600' : 'hover:bg-white/10'}`}><Icon size={18}/>{label}</button>)}</nav>
      <div className="mt-4 border-t border-white/10 px-4 py-5"><p className="mb-3 text-xs uppercase text-slate-400">Filter</p><FilterSelect label="Status Project" value={filter.projectStatus} onChange={(v) => setFilter({ ...filter, projectStatus: v, projectId: 'all' })} options={[[ 'all', 'Semua Status Project' ], ['Active', 'Project Aktif'], ['Done', 'Project Done'], ['Cancel', 'Project Cancel']]} /><FilterSelect label="Semua Project" value={filter.projectId} onChange={(v) => setFilter({ ...filter, projectId: v })} options={[[ 'all', 'Semua Project' ], ...projects.filter(p => !isArchived(p) && (filter.projectStatus === 'all' || normProjectStatus(p) === filter.projectStatus)).map(p => [p.id, p.name])]} /><FilterSelect label="Semua PIC" value={filter.pic} onChange={(v) => setFilter({ ...filter, pic: v })} options={[[ 'all', 'Semua PIC' ], ...picNames.map(p => [p, p])]} /><FilterSelect label="Semua Status" value={filter.status} onChange={(v) => setFilter({ ...filter, status: v })} options={[[ 'all', 'Semua Status' ], ...statuses.map(s => [s, s])]} /><FilterSelect label="Semua Kategori" value={filter.category} onChange={(v) => setFilter({ ...filter, category: v })} options={[[ 'all', 'Semua Kategori' ], ...categories.map(c => [c, c])]} /></div>
      <div className="mt-auto px-4 pb-6 text-xs text-slate-300"><div className="mb-3 rounded-xl bg-white/10 p-4"><p>{syncMessage}</p></div><button onClick={syncFromSheet} className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 font-semibold text-white"><Download size={16}/>Refresh dari Google Sheet</button><button onClick={pushToSheet} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 font-semibold text-white"><Upload size={16}/>Sinkron Penuh</button></div>
    </aside>
    <section className="lg:pl-72"><Header page={page} filter={filter} setFilter={setFilter} exportJson={exportJson} currentUser={currentUser} role={role} logout={logout} notifItems={notifItems} unreadCount={unreadCount} onMarkSeen={markNotifSeen} onPickTask={(task: Task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }}/><div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="p-5 lg:p-8">{page !== 'Dashboard' && <KpiRow kpis={kpis}/>}{page === 'Dashboard' && <DashboardPage tasks={tasks} projects={projects}/>}{page === 'Kalender' && <><CalendarToolbar month={month} setMonth={setMonth} nextMonth={nextMonth} view={view} setView={setView} openCreate={openCreate} zoom={zoom} setZoom={setZoom}/>{view === 'Bulan' && <CalendarView days={days} month={month} tasks={filteredTasks} projects={projects} onCreate={openCreate} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} onMove={moveTaskDate} />}{view === 'Minggu' && <WeekView month={month} tasks={filteredTasks} projects={projects} onCreate={openCreate} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} onMove={moveTaskDate}/>} {view === 'Quarter' && <QuarterView month={month} zoom={zoom} tasks={filteredTasks} projects={projects} onCreate={openCreate} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} onMove={moveTaskDate}/>} {view === 'Timeline' && <TimelineView tasks={filteredTasks} projects={projects} statuses={statuses} canEdit={canCreate} onStatus={changeStatus} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} />} {view === 'Gantt' && <GanttView month={month} tasks={filteredTasks} projects={projects} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }}/>}<Legend projects={projects}/></>}{page === 'Timeline' && <TimelineView tasks={filteredTasks} projects={projects} statuses={statuses} canEdit={canCreate} onStatus={changeStatus} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} />}{page === 'Kanban' && <KanbanView statuses={statuses} tasks={filteredTasks} projects={projects} onSelect={(task) => { setSelectedTaskId(task.id); setDrawerOpen(true); }} onStatus={(id: string, status: string) => changeStatus(id, { statusMode: 'manual', status })}/>} {page === 'Tasks' && <TasksPage tasks={filteredTasks} projects={projects} statuses={statuses} canEdit={canCreate} onStatus={changeStatus} onCreate={() => openCreate(todayIso())} onEdit={openEdit} onDelete={deleteTask}/>} {page === 'Projects' && <ProjectsPage projects={projects} tasks={tasks} canManage={canManage} canDelete={canDelete} onCreate={openCreateProject} onEdit={openEditProject} onArchive={setProjectArchived} onDeletePermanent={deleteProjectPermanent}/>} {page === 'PIC / Team' && <TeamPage pics={pics} setPics={updatePics} tasks={tasks} projects={projects} canManage={canManage} onRenamePic={renamePic}/>} {page === 'Pengaturan' && <SettingsPage settings={settings} setSettings={updateSettings} categories={categories} setCategories={updateCategories} statuses={statuses} setStatuses={updateStatuses} requesters={requesters} setRequesters={updateRequesters} users={users} onSaveUser={saveUser} onRemoveUser={removeUser} canManageUsers={canManageUsers}/>}</div><aside className="relative hidden border-l bg-white xl:block"><AssistantPanel currentUser={currentUser} buildContext={buildAiContext} tasks={tasks} projects={projects} onOpenTask={(t: Task) => { setSelectedTaskId(t.id); setDrawerOpen(true); }} onOpenProject={() => switchPage('Projects')}/>{drawerOpen && <div data-drawer className="absolute inset-0 z-20 overflow-y-auto bg-white"><TaskDrawer task={selectedTask} projects={projects} onClose={() => setDrawerOpen(false)} onEdit={openEdit} onDelete={deleteTask}/></div>}</aside>{drawerOpen && <div data-drawer className="fixed inset-x-0 bottom-0 top-20 z-30 overflow-y-auto bg-white xl:hidden"><TaskDrawer task={selectedTask} projects={projects} onClose={() => setDrawerOpen(false)} onEdit={openEdit} onDelete={deleteTask}/></div>}</div></section>{modalOpen && <TaskModal form={form} setForm={setForm} onClose={() => setModalOpen(false)} onSave={saveTask} projects={projects} pics={picNames} categories={categories} statuses={statuses}/>}{projectModalOpen && <ProjectModal form={projectForm} setForm={setProjectForm} requesters={requesters} pics={picNames} onClose={() => setProjectModalOpen(false)} onSave={saveProject} onArchive={setProjectArchived}/>}</main>;
}

function Header({ page, filter, setFilter, exportJson, currentUser, role, logout, notifItems, unreadCount, onMarkSeen, onPickTask }: any) {
  const [notifOpen, setNotifOpen] = useState(false);
  const toggleNotif = () => { const next = !notifOpen; setNotifOpen(next); if (next) onMarkSeen(); };
  const chip = (n: any) => n.kind === 'finance' ? { label: n.diff === 0 ? 'Finance · Hari-H' : `Finance · H-${n.diff}`, cls: 'bg-amber-100 text-amber-800' } : { label: 'Hari ini', cls: 'bg-blue-100 text-blue-700' };
  return <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b bg-white/90 px-5 backdrop-blur lg:px-8">
    <div className="flex items-center gap-5"><button className="rounded-lg p-2 hover:bg-slate-100"><Menu size={20}/></button><div><h2 className="text-xl font-bold">{page}</h2><p className="text-sm text-slate-500">Kelola timeline project tim multimedia</p></div></div>
    <div className="hidden w-96 items-center gap-2 rounded-xl border bg-white px-3 py-2 md:flex"><Search size={18} className="text-slate-400"/><input value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} placeholder="Cari task, project, PIC..." className="w-full outline-none" /></div>
    <div className="flex items-center gap-3">
      <div className="relative" data-drawer>
        <button onClick={toggleNotif} title="Notifikasi" className="relative rounded-xl border p-2.5 hover:bg-slate-100"><Bell size={18}/>{unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{unreadCount}</span>}</button>
        {notifOpen && <><div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)}/><div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-96 overflow-auto rounded-2xl border bg-white p-2 shadow-xl">
          <p className="px-3 py-2 text-sm font-bold">Notifikasi</p>
          {(!notifItems || notifItems.length === 0) && <p className="px-3 pb-3 text-sm text-slate-400">Tidak ada notifikasi hari ini.</p>}
          {notifItems.map((n: any) => { const c = chip(n); return <button key={`${n.kind}-${n.task.id}`} onClick={() => { onPickTask(n.task); setNotifOpen(false); }} className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-slate-50">
            <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${c.cls}`}>{c.label}</span>
            <span className="block truncate text-sm font-semibold">{n.task.title}</span>
            <span className="block text-xs text-slate-500">Deadline {n.task.endDate || n.task.startDate} · {n.task.pic}</span>
          </button>; })}
        </div></>}
      </div>
      <button onClick={exportJson} className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-100">Export</button><button onClick={logout} className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-100">Logout</button><div className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 font-bold">{currentUser?.name?.charAt(0) || 'U'}</div><div className="hidden text-sm md:block"><p className="font-semibold">{currentUser?.name}</p><p className="text-xs text-slate-500">{role}</p></div>
    </div>
  </header>;
}
function KpiRow({ kpis }: { kpis: { total: number; progress: number; overdue: number; dueSoon: number } }) { return <div className="mb-5 grid gap-3 md:grid-cols-4"><Kpi title="Total Task" value={kpis.total}/><Kpi title="Progress" value={kpis.progress}/><Kpi title="Overdue" value={kpis.overdue} warning/><Kpi title="Deadline ≤ 3 Hari" value={kpis.dueSoon} warning/></div>; }
function Kpi({ title, value, warning }: { title: string; value: number; warning?: boolean }) { return <div className="rounded-2xl border bg-white p-4 shadow-soft"><p className="text-sm text-slate-500">{title}</p><p className={`mt-1 text-2xl font-bold ${warning && value ? 'text-orange-600' : 'text-slate-900'}`}>{value}</p></div>; }
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (v: string) => void }) { return <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="mb-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm text-white outline-none [&_option]:text-slate-900">{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select>; }
function CalendarToolbar({ month, setMonth, nextMonth, view, setView, openCreate, zoom, setZoom }: any) { const years = Array.from({ length: 9 }, (_, i) => 2023 + i); return <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><button onClick={() => nextMonth(-1)} className="rounded-xl border bg-white p-3 hover:bg-slate-100"><ChevronLeft size={18}/></button><button onClick={() => nextMonth(1)} className="rounded-xl border bg-white p-3 hover:bg-slate-100"><ChevronRight size={18}/></button><button onClick={() => setMonth(new Date())} className="rounded-xl border bg-white px-4 py-3 font-semibold hover:bg-slate-100">Hari ini</button></div><div className="flex items-center gap-2"><select value={month.getMonth()} onChange={e => setMonth(new Date(month.getFullYear(), Number(e.target.value), 1))} className="rounded-xl border bg-white px-4 py-3 text-lg font-bold outline-none">{monthNames.map((m, i) => <option key={m} value={i}>{m}</option>)}</select><select value={month.getFullYear()} onChange={e => setMonth(new Date(Number(e.target.value), month.getMonth(), 1))} className="rounded-xl border bg-white px-4 py-3 text-lg font-bold outline-none">{years.map(y => <option key={y}>{y}</option>)}</select></div><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-xl border bg-white p-1">{viewButtons.map(v => <button key={v} onClick={() => { setView(v); if (v === 'Minggu') setMonth(new Date()); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === v ? 'bg-blue-50 text-blue-700' : 'text-slate-600'}`}>{v}</button>)}</div><label className="hidden items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm lg:flex">Zoom <input type="range" min="55" max="120" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}/></label><button onClick={() => openCreate(todayIso())} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-soft"><Plus size={18}/>Tambah Task</button></div></div>; }
function Legend({ projects }: { projects: Project[] }) { return <div className="mt-5 flex flex-wrap gap-5 text-sm text-slate-600">{projects.map(project => <span key={project.id} className="flex items-center gap-2"><i className="h-3 w-3 rounded-full" style={{ background: project.color }} />{project.name}</span>)}</div>; }

function CalendarView({ days, month, tasks, projects, onCreate, onSelect, onMove }: any) { return <div className="overflow-hidden rounded-2xl border bg-white shadow-soft"><div className="grid grid-cols-7 border-b bg-slate-50">{dayNames.map(day => <div key={day} className="p-4 text-center text-sm font-semibold">{day}</div>)}</div><div className="grid grid-cols-7">{days.map(day => <DayCell key={toIsoDate(day)} day={day} currentMonth={month} tasks={tasks} projects={projects} onCreate={onCreate} onSelect={onSelect} onMove={onMove}/>)}</div></div>; }
function DayCell({ day, currentMonth, tasks, projects, onCreate, onSelect, onMove, compact = false }: any) { const iso = toIsoDate(day); const dayTasks = tasks.filter((t: Task) => isTaskOnDate(t, iso)); const visible = dayTasks.slice(0, compact ? 2 : 4); return <div onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('text/plain'); if (id) onMove(id, iso); }} className={`calendar-cell border-b border-r p-3 ${sameMonth(day, currentMonth) ? 'bg-white' : 'bg-slate-50 text-slate-400'} ${compact ? 'min-h-[120px]' : ''} ${toIsoDate(day) === todayIso() ? 'bg-blue-50/60 ring-2 ring-inset ring-blue-400' : ''}`}><div className="mb-2 flex items-center justify-between"><span className={`font-semibold ${toIsoDate(day) === todayIso() ? 'grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-white' : ''}`}>{day.getDate()}</span><button onClick={() => onCreate(iso)} title="Tambah task di tanggal ini" className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700"><Plus size={17}/></button></div><div className="space-y-1.5">{visible.map((task: Task) => { const project = projectById(projects, task.projectId); const multi = (task.endDate || task.startDate) !== task.startDate; return <button key={task.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', task.id)} onClick={() => onSelect(task)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-xs font-medium leading-tight hover:brightness-95" style={{ background: tint(project.color), borderLeft: `3px solid ${project.color}` }}><span className="task-dot" style={{ background: project.color }} /><span className="truncate">{multi && iso !== task.startDate ? '↳ ' : ''}{task.title}</span></button>; })}{dayTasks.length > visible.length && <button onClick={() => onSelect(dayTasks[visible.length])} className="text-xs font-semibold text-slate-500">+ {dayTasks.length - visible.length} lagi</button>}</div></div>; }
function WeekView({ month, tasks, projects, onCreate, onSelect, onMove }: any) { const start = getMondayStart(month); const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; }); return <CalendarView days={days} month={month} tasks={tasks} projects={projects} onCreate={onCreate} onSelect={onSelect} onMove={onMove}/>; }
function QuarterView({ month, zoom, tasks, projects, onCreate, onSelect, onMove }: any) { const qStartMonth = Math.floor(month.getMonth() / 3) * 3; const months = [0, 1, 2].map(i => new Date(month.getFullYear(), qStartMonth + i, 1)); return <div className="rounded-2xl border bg-white p-4 shadow-soft"><div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">Q{Math.floor(month.getMonth()/3)+1} {month.getFullYear()}</h3><p className="text-sm text-slate-500">Scrollbar ada di atas kalender. Geser horizontal atau pakai slider zoom.</p></div><TopScroll><div className="flex gap-4" style={{ minWidth: `${zoom * 22}px` }}>{months.map(m => <div key={m.toISOString()} className="shrink-0" style={{ width: `${zoom * 9}px`, minWidth: 620 }}><h4 className="mb-3 text-center font-bold">{monthNames[m.getMonth()]}</h4><CalendarView days={getCalendarDays(m)} month={m} tasks={tasks} projects={projects} onCreate={onCreate} onSelect={onSelect} onMove={onMove}/></div>)}</div></TopScroll></div>; }
function TimelineView({ tasks, projects, statuses, canEdit, onStatus, onSelect }: { tasks: Task[]; projects: Project[]; statuses: string[]; canEdit: boolean; onStatus: (id: string, patch: Partial<Task>) => void; onSelect: (task: Task) => void }) {
  return <div className="rounded-2xl border bg-white p-4 shadow-soft">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4"><h3 className="text-lg font-bold">Timeline per Project</h3><StatusLegend statuses={statuses} /></div>
    <div className="space-y-7">{projects.map(project => {
      const list = tasks.filter(t => t.projectId === project.id).sort((a, b) => a.startDate.localeCompare(b.startDate));
      if (!list.length) return null;
      const active = list.filter(t => effectiveStatus(t) !== 'Canceled');
      const done = active.filter(t => effectiveStatus(t) === 'Done').length;
      const pct = active.length ? Math.round((done / active.length) * 100) : 0;
      return <section key={project.id}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="flex items-center gap-2 font-bold"><i className="h-3 w-3 rounded-full" style={{ background: project.color }} />{project.name}</h3>
          <span className="text-xs text-slate-400">{done}/{active.length} selesai</span>
          <div className="ml-auto flex w-full items-center gap-3 sm:w-64">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: project.color }} /></div>
            <span className="w-10 text-right text-sm font-bold tabular-nums" style={{ color: project.color }}>{pct}%</span>
          </div>
        </div>
        <div className="space-y-2">{list.map(task => { const meta = statusMeta(displayStatus(task)); const overdue = isOverdue(task); return (
          <div key={task.id} onClick={() => onSelect(task)} className={`flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition hover:brightness-[.98] ${overdue ? 'ring-1 ring-rose-300' : ''}`} style={{ background: meta.card, borderLeft: `4px solid ${project.color}` }}>
            <span className="font-semibold">{task.title}</span>
            <span className="flex flex-1 flex-wrap items-center justify-center gap-2">
              {String(task.category || '').toLowerCase() === 'finance' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"><Banknote size={13}/>Finance</span>}
              {task.link && <a href={/^https?:[/][/]/i.test(task.link) ? task.link : `https://${task.link}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200"><Link2 size={13}/>Attachment</a>}
              {task.meetLink && <a href={task.meetLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200"><Video size={13}/>Meet</a>}
            </span>
            <span className="flex items-center gap-3 text-sm text-slate-500"><span>{task.startDate} - {task.endDate || task.startDate} · {task.pic}</span><StatusControl task={task} statuses={statuses} editable={canEdit} onChange={(patch) => onStatus(task.id, patch)} /></span>
          </div>
        ); })}</div>
      </section>;
    })}</div>
  </div>;
}
function GanttView({ month, tasks, projects, onSelect }: any) { const start = new Date(month.getFullYear(), month.getMonth(), 1); const total = 92; const scale = 12; return <div className="overflow-auto rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 text-lg font-bold">Gantt / Timeline 3 Bulan</h3><div style={{ minWidth: total * scale + 220 }}><div className="ml-[220px] grid" style={{ gridTemplateColumns: `repeat(${total}, ${scale}px)` }}>{Array.from({ length: total }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return <div key={i} className="border-l text-[10px] text-slate-400">{d.getDate() === 1 ? monthNames[d.getMonth()].slice(0,3) : ''}</div>; })}</div>{tasks.map(task => { const project = projectById(projects, task.projectId); const left = Math.max(0, Math.round((parseIso(task.startDate).getTime() - start.getTime()) / 86400000)); const width = Math.max(1, diffDays(task.startDate, task.endDate || task.startDate) + 1); return <div key={task.id} className="relative my-2 h-9"><div className="absolute left-0 top-1 w-[210px] truncate text-sm font-semibold">{task.title}</div><button onClick={() => onSelect(task)} className="absolute top-0 h-8 rounded-lg px-3 text-left text-xs font-semibold" style={{ left: 220 + left * scale, width: width * scale, minWidth: 80, background: tint(project.color), borderLeft: `4px solid ${project.color}` }}>{project.name}</button></div>; })}</div></div>; }
function TopScroll({ children }: any) { return <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}><div style={{ transform: 'rotateX(180deg)' }}>{children}</div></div>; }
function KanbanView({ statuses, tasks, projects, onSelect, onStatus }: any) { return <TopScroll><div className="flex gap-4 min-w-max pb-1">{statuses.map((status: string) => { const meta = statusMeta(status); const colTasks = tasks.filter((t: Task) => effectiveStatus(t) === status); return <div key={status} onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('text/plain'); if (id) onStatus(id, status); }} className="w-72 rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-3 flex items-center justify-between font-bold"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: meta.dot }} />{status}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{colTasks.length}</span></h3><div className="space-y-3">{colTasks.map((task: Task) => { const p = projectById(projects, task.projectId); const overdue = isOverdue(task); const m = statusMeta(displayStatus(task)); return <button key={task.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', task.id)} onClick={() => onSelect(task)} className={`w-full rounded-xl border p-3 text-left text-sm hover:brightness-[.98] ${overdue ? 'ring-1 ring-rose-300' : ''}`} style={{ borderLeft: `4px solid ${p.color}`, background: m.card }}><b>{task.title}</b><p className="mt-1 flex items-center justify-between text-xs text-slate-500"><span>{task.pic} · {task.startDate}</span>{overdue && <span className="font-semibold text-rose-600">Overdue</span>}</p></button>; })}</div></div>; })}</div></TopScroll>; }
function TasksPage({ tasks, projects, statuses, canEdit, onStatus, onCreate, onEdit, onDelete }: any) { return <div className="rounded-2xl border bg-white p-4 shadow-soft"><div className="mb-4 flex justify-between"><h3 className="text-lg font-bold">Semua Task</h3><button onClick={onCreate} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Tambah Task</button></div><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-3">Task</th><th>Project</th><th>PIC</th><th>Tanggal</th><th>Status</th><th></th></tr></thead><tbody>{tasks.map((task: Task) => <tr key={task.id} className="border-b"><td className="p-3 font-semibold">{task.title}</td><td>{projectById(projects, task.projectId).name}</td><td>{task.pic}</td><td>{task.startDate} - {task.endDate || task.startDate}</td><td className="py-2"><StatusControl task={task} statuses={statuses} editable={canEdit} onChange={(patch: Partial<Task>) => onStatus(task.id, patch)} /></td><td className="space-x-2 text-right"><button onClick={() => onEdit(task)} className="rounded-lg border px-3 py-1">Edit</button><button onClick={() => onDelete(task.id)} className="rounded-lg border border-red-200 px-3 py-1 text-red-600">Hapus</button></td></tr>)}</tbody></table></div></div>; }
function ymKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function ymAdd(ym: string, n: number) { const [y, m] = ym.split('-').map(Number); return ymKey(new Date(y, m - 1 + n, 1)); }
function ymLabel(ym: string) { const [y, m] = ym.split('-').map(Number); return `${monthNames[m - 1].slice(0, 3)} '${String(y).slice(2)}`; }
function DashboardPage({ tasks, projects }: { tasks: Task[]; projects: Project[] }) {
  const nowYm = ymKey(new Date());
  const [preset, setPreset] = useState<'this' | '3m' | '6m' | 'custom'>('this');
  const [fromYm, setFromYm] = useState(ymAdd(nowYm, -2));
  const [toYm, setToYm] = useState(nowYm);
  const [from, to] = useMemo(() => {
    if (preset === 'this') return [nowYm, nowYm];
    if (preset === '3m') return [ymAdd(nowYm, -2), nowYm];
    if (preset === '6m') return [ymAdd(nowYm, -5), nowYm];
    const f = fromYm || nowYm, t = toYm || nowYm;
    return f <= t ? [f, t] : [t, f];
  }, [preset, fromYm, toYm, nowYm]);
  const inRange = (ym?: string) => !!ym && ym >= from && ym <= to;
  const periodTasks = useMemo(() => tasks.filter((t) => inRange((t.startDate || '').slice(0, 7))), [tasks, from, to]);
  const periodProjects = useMemo(() => {
    const withTasks = new Set(periodTasks.map((t) => t.projectId));
    return projects.filter((p) => !isArchived(p) && (inRange(p.startMonth) || withTasks.has(p.id)));
  }, [projects, periodTasks, from, to]);
  const doneCount = periodTasks.filter((t) => effectiveStatus(t) === 'Done').length;
  const activeCount = periodTasks.filter((t) => effectiveStatus(t) !== 'Canceled').length;
  const completion = activeCount ? Math.round((doneCount / activeCount) * 100) : 0;
  const totalBudget = periodProjects.reduce((s, p) => s + Number(p.budget || 0), 0);
  const outL = periodProjects.reduce((s, p) => s + Number(p.outputLandscape || 0), 0);
  const outV = periodProjects.reduce((s, p) => s + Number(p.outputVertical || 0), 0);
  const overdueCount = periodTasks.filter((t) => isOverdue(t)).length;
  const months = useMemo(() => { const arr: string[] = []; let cur = from, guard = 0; while (cur <= to && guard < 36) { arr.push(cur); cur = ymAdd(cur, 1); guard++; } return arr; }, [from, to]);
  const trend = months.map((m) => ({ m, total: tasks.filter((t) => (t.startDate || '').slice(0, 7) === m).length, done: tasks.filter((t) => effectiveStatus(t) === 'Done' && ((t.endDate || t.startDate) || '').slice(0, 7) === m).length }));
  const maxTrend = Math.max(1, ...trend.map((d) => Math.max(d.total, d.done)));
  const statusRows = ['Planned', 'Progress', 'Waiting', 'Review', 'Done', 'Canceled', 'Overdue'].map((s) => [s, s === 'Overdue' ? overdueCount : periodTasks.filter((t) => effectiveStatus(t) === s && (s === 'Done' || s === 'Canceled' || !isOverdue(t))).length] as [string, number]).filter(([, c]) => c > 0);
  const statusTotal = Math.max(1, statusRows.reduce((s, [, c]) => s + c, 0));
  const projRows = periodProjects.map((p) => { const list = periodTasks.filter((t) => t.projectId === p.id); const act = list.filter((t) => effectiveStatus(t) !== 'Canceled'); const dn = act.filter((t) => effectiveStatus(t) === 'Done').length; return { p, total: list.length, done: dn, act: act.length, pct: act.length ? Math.round((dn / act.length) * 100) : 0, budget: Number(p.budget || 0), outL: Number(p.outputLandscape || 0), outV: Number(p.outputVertical || 0) }; }).sort((a, b) => b.total - a.total);
  const maxBudget = Math.max(1, ...projRows.map((r) => r.budget));
  const picRows = Array.from(new Set(periodTasks.map((t) => t.pic).filter(Boolean))).map((name) => ({ name, count: periodTasks.filter((t) => t.pic === name).length, done: periodTasks.filter((t) => t.pic === name && effectiveStatus(t) === 'Done').length })).sort((a, b) => b.count - a.count).slice(0, 10);
  const maxPic = Math.max(1, ...picRows.map((r) => r.count));
  // On-time delivery: task Done dianggap tepat waktu jika tanggal terakhir diubah <= deadline (proxy tanggal selesai).
  const doneTasks = periodTasks.filter((t) => effectiveStatus(t) === 'Done');
  const onTime = doneTasks.filter((t) => { const done = (t.updatedAt || '').slice(0, 10) || todayIso(); return done <= (t.endDate || t.startDate || done); }).length;
  const late = doneTasks.length - onTime;
  const onTimeRate = doneTasks.length ? Math.round((onTime / doneTasks.length) * 100) : 0;
  // Rata-rata durasi task per kategori (hari, inklusif).
  const durRows = Array.from(new Set(periodTasks.map((t) => t.category).filter(Boolean))).map((cat) => { const list = periodTasks.filter((t) => t.category === cat); const avg = list.reduce((s, t) => s + (diffDays(t.startDate, t.endDate || t.startDate) + 1), 0) / list.length; return { cat, avg: Math.round(avg * 10) / 10, count: list.length }; }).sort((a, b) => b.avg - a.avg);
  const maxDur = Math.max(1, ...durRows.map((r) => r.avg));
  // Budget vs Realisasi
  const totalActual = periodProjects.reduce((s, p) => s + Number(p.actualCost || 0), 0);
  const budgetRows = projRows.filter((r) => r.budget > 0 || Number(r.p.actualCost || 0) > 0).map((r) => ({ ...r, actual: Number(r.p.actualCost || 0) }));
  const maxBvA = Math.max(1, ...budgetRows.map((r) => Math.max(r.budget, r.actual)));
  const budgetUsedPct = totalBudget ? Math.round((totalActual / totalBudget) * 100) : 0;
  const periodLabel = from === to ? ymLabel(from) : `${ymLabel(from)} - ${ymLabel(to)}`;
  const presets: [typeof preset, string][] = [['this', 'Bulan ini'], ['3m', '3 bulan terakhir'], ['6m', '6 bulan terakhir'], ['custom', 'Custom']];
  return <div className="space-y-4" data-print-area>
    <div className="mb-1 hidden items-baseline justify-between print:flex"><h1 className="text-xl font-bold">Laporan Produktivitas — {periodLabel}</h1><span className="text-xs text-slate-500">Timeline Project</span></div>
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-soft print:hidden">
      <div className="flex flex-wrap gap-2">{presets.map(([k, l]) => <button key={k} onClick={() => setPreset(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${preset === k ? 'bg-blue-600 text-white' : 'border text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}</div>
      {preset === 'custom' && <div className="flex items-center gap-2 text-sm"><input type="month" className="rounded-lg border px-3 py-1.5" value={fromYm} onChange={(e) => setFromYm(e.target.value)}/><span className="text-slate-400">s/d</span><input type="month" className="rounded-lg border px-3 py-1.5" value={toYm} onChange={(e) => setToYm(e.target.value)}/></div>}
      <span className="ml-auto text-sm font-semibold text-slate-500">Periode: {periodLabel}</span><button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><Download size={15}/>Export PDF</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><p className="text-sm text-slate-500">Project Berjalan</p><p className="mt-1 text-3xl font-bold">{periodProjects.length}</p></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><p className="text-sm text-slate-500">Task Selesai</p><p className="mt-1 text-3xl font-bold">{doneCount}<span className="text-lg font-semibold text-slate-400">/{activeCount}</span></p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-green-500" style={{ width: `${completion}%` }}/></div><p className="mt-1 text-xs font-semibold text-green-600">{completion}% completion</p></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><p className="text-sm text-slate-500">Overdue</p><p className={`mt-1 text-3xl font-bold ${overdueCount ? 'text-red-600' : ''}`}>{overdueCount}</p></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><p className="text-sm text-slate-500">Total Budget</p><p className="mt-1 text-2xl font-bold">{formatRupiah(totalBudget)}</p></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><p className="text-sm text-slate-500">Output Konten</p><p className="mt-1 text-3xl font-bold">{outL + outV}</p><p className="mt-1 text-xs font-semibold text-slate-500">{outL} landscape · {outV} vertical</p></div><div className="rounded-2xl border bg-white p-4 shadow-soft"><p className="text-sm text-slate-500">On-Time Delivery</p><p className={`mt-1 text-3xl font-bold ${onTimeRate >= 80 ? 'text-green-600' : onTimeRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{onTimeRate}%</p><p className="mt-1 text-xs font-semibold text-slate-500">{onTime} tepat waktu · {late} telat</p></div>
    </div>
    <div className="rounded-2xl border bg-white p-4 shadow-soft"><p className="text-sm leading-relaxed text-slate-600"><b className="text-slate-900">Ringkasan {periodLabel}:</b> {periodProjects.length} project berjalan dengan {periodTasks.length} task; {doneCount} dari {activeCount} task selesai ({completion}%){overdueCount ? `, ${overdueCount} task overdue` : ', tanpa overdue'}. Total budget project {formatRupiah(totalBudget)} (realisasi {formatRupiah(totalActual)}, {budgetUsedPct}% terpakai) dengan target output {outL + outV} konten ({outL} landscape, {outV} vertical). On-time delivery {onTimeRate}% ({onTime} dari {doneTasks.length} task selesai tepat waktu).</p></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 font-bold">Progress per Project</h3>{projRows.length === 0 && <p className="text-sm text-slate-400">Tidak ada project dalam periode ini.</p>}<div className="space-y-3">{projRows.map((r) => <div key={r.p.id}><div className="mb-1 flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-semibold"><i className="h-2.5 w-2.5 rounded-full" style={{ background: r.p.color }}/>{r.p.name}</span><span className="text-slate-500">{r.done}/{r.act} · <b style={{ color: r.p.color }}>{r.pct}%</b></span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.p.color }}/></div></div>)}</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 font-bold">Budget per Project</h3>{projRows.filter((r) => r.budget > 0).length === 0 && <p className="text-sm text-slate-400">Belum ada budget terisi pada project periode ini.</p>}<div className="space-y-3">{projRows.filter((r) => r.budget > 0).map((r) => <div key={r.p.id}><div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold">{r.p.name}</span><b>{formatRupiah(r.budget)}</b></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.round((r.budget / maxBudget) * 100)}%`, background: r.p.color }}/></div></div>)}</div><p className="mt-4 border-t pt-3 text-right text-sm font-bold">Total: {formatRupiah(totalBudget)}</p></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-1 font-bold">Tren Task per Bulan</h3><p className="mb-4 text-xs text-slate-500">Bar abu = task dimulai, bar hijau = task selesai</p><div className="flex h-44 items-end gap-3 overflow-x-auto pb-1">{trend.map((d) => <div key={d.m} className="flex min-w-[52px] flex-1 flex-col items-center gap-1"><div className="flex h-32 w-full items-end justify-center gap-1.5"><div className="w-4 rounded-t bg-slate-300" style={{ height: `${Math.round((d.total / maxTrend) * 100)}%` }} title={`${d.total} task dimulai`}/><div className="w-4 rounded-t bg-green-500" style={{ height: `${Math.round((d.done / maxTrend) * 100)}%` }} title={`${d.done} selesai`}/></div><span className="text-[11px] font-semibold text-slate-500">{ymLabel(d.m)}</span><span className="text-[11px] text-slate-400">{d.done}/{d.total}</span></div>)}</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 font-bold">Distribusi Status Task</h3><div className="mb-4 flex h-5 w-full overflow-hidden rounded-full">{statusRows.map(([s, c]) => <div key={s} style={{ width: `${(c / statusTotal) * 100}%`, background: statusMeta(s).dot }} title={`${s}: ${c}`}/>)}</div><div className="grid grid-cols-2 gap-2">{statusRows.map(([s, c]) => <div key={s} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm" style={{ background: statusMeta(s).card }}><span className="flex items-center gap-2 font-semibold" style={{ color: statusMeta(s).text }}><i className="h-2 w-2 rounded-full" style={{ background: statusMeta(s).dot }}/>{s}</span><b style={{ color: statusMeta(s).text }}>{c} <span className="font-medium opacity-70">({Math.round((c / statusTotal) * 100)}%)</span></b></div>)}</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 font-bold">Workload per PIC</h3>{picRows.length === 0 && <p className="text-sm text-slate-400">Tidak ada task dalam periode ini.</p>}<div className="space-y-3">{picRows.map((r) => <div key={r.name}><div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold">{r.name}</span><span className="text-slate-500">{r.done} selesai / <b className="text-slate-800">{r.count} task</b></span></div><div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="absolute h-full rounded-full bg-blue-200" style={{ width: `${Math.round((r.count / maxPic) * 100)}%` }}/><div className="absolute h-full rounded-full bg-blue-600" style={{ width: `${Math.round((r.done / maxPic) * 100)}%` }}/></div></div>)}</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 font-bold">Output per Project</h3>{projRows.filter((r) => r.outL + r.outV > 0).length === 0 && <p className="text-sm text-slate-400">Belum ada target output terisi pada project periode ini.</p>}<div className="space-y-2.5">{projRows.filter((r) => r.outL + r.outV > 0).map((r) => <div key={r.p.id} className="flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm"><span className="flex items-center gap-2 font-semibold"><i className="h-2.5 w-2.5 rounded-full" style={{ background: r.p.color }}/>{r.p.name}</span><span className="flex items-center gap-2"><span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-700">{r.outL} landscape</span><span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700">{r.outV} vertical</span></span></div>)}</div><p className="mt-4 border-t pt-3 text-right text-sm font-bold">Total: {outL} landscape · {outV} vertical</p></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-1 font-bold">Budget vs Realisasi</h3><p className="mb-4 text-xs text-slate-500">Bar atas = budget, bar bawah = realisasi (merah bila melebihi budget)</p>{budgetRows.length === 0 && <p className="text-sm text-slate-400">Belum ada budget/realisasi terisi pada periode ini.</p>}<div className="space-y-3">{budgetRows.map((r) => { const over = r.actual > r.budget && r.budget > 0; return <div key={r.p.id}><div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold">{r.p.name}</span><span className="text-slate-500">{formatRupiah(r.actual)} / {formatRupiah(r.budget)}{over && <b className="text-red-600"> · over</b>}</span></div><div className="space-y-1"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.round((r.budget / maxBvA) * 100)}%` }}/></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.round((r.actual / maxBvA) * 100)}%`, background: over ? '#ef4444' : '#22c55e' }}/></div></div></div>; })}</div><div className="mt-4 flex items-center justify-between border-t pt-3 text-sm"><span className="font-semibold">Total realisasi</span><b className={budgetUsedPct > 100 ? 'text-red-600' : ''}>{formatRupiah(totalActual)} / {formatRupiah(totalBudget)} ({budgetUsedPct}%)</b></div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 font-bold">Rata-rata Durasi Task per Kategori</h3>{durRows.length === 0 && <p className="text-sm text-slate-400">Tidak ada task dalam periode ini.</p>}<div className="space-y-3">{durRows.map((r) => <div key={r.cat}><div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold">{r.cat}</span><span className="text-slate-500">{r.avg} hari <span className="text-slate-400">· {r.count} task</span></span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.round((r.avg / maxDur) * 100)}%` }}/></div></div>)}</div></div>
    </div>
  </div>;
}

function ProjectsPage({ projects, tasks, canManage, canDelete, onCreate, onEdit, onArchive, onDeletePermanent }: { projects: Project[]; tasks: Task[]; canManage: boolean; canDelete: boolean; onCreate: () => void; onEdit: (p: Project) => void; onArchive: (id: string, archived: boolean) => void; onDeletePermanent: (id: string) => void }) {
  const [tab, setTab] = useState<'Projects' | 'Arsip'>('Projects');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const list = useMemo(() => {
    let arr = projects.filter((p) => tab === 'Arsip' ? isArchived(p) : !isArchived(p));
    if (tab === 'Projects') {
      if (statusFilter !== 'all') arr = arr.filter((p) => normProjectStatus(p) === statusFilter);
      if (fromMonth) arr = arr.filter((p) => (p.startMonth || '') >= fromMonth);
      if (toMonth) arr = arr.filter((p) => (p.startMonth || '') !== '' && (p.startMonth || '') <= toMonth);
    }
    const prog = (p: Project) => projectProgress(tasks, p.id).pct;
    const sorters: Record<string, (a: Project, b: Project) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      budgetDesc: (a, b) => Number(b.budget || 0) - Number(a.budget || 0),
      budgetAsc: (a, b) => Number(a.budget || 0) - Number(b.budget || 0),
      dateDesc: (a, b) => String(b.startMonth || '').localeCompare(String(a.startMonth || '')),
      dateAsc: (a, b) => String(a.startMonth || '').localeCompare(String(b.startMonth || '')),
      progressDesc: (a, b) => prog(b) - prog(a),
      progressAsc: (a, b) => prog(a) - prog(b)
    };
    return [...arr].sort(sorters[sortBy] || sorters.name);
  }, [projects, tasks, tab, statusFilter, fromMonth, toMonth, sortBy]);
  return <div className="rounded-2xl border bg-white p-4 shadow-soft">
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex rounded-xl border p-1 text-sm font-semibold">{(['Projects', 'Arsip'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>{t === 'Arsip' && <Archive size={14}/>}{t}</button>)}</div>
      {canManage && tab === 'Projects' && <button onClick={onCreate} className="ml-auto flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Plus size={16}/>Tambah</button>}
    </div>
    {tab === 'Projects' && <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3 text-sm">
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Status</span><select className="rounded-lg border bg-white px-3 py-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Semua</option><option value="Active">Aktif</option><option value="Done">Selesai (Done)</option><option value="Cancel">Cancel</option></select></label>
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Dari bulan</span><input type="month" className="rounded-lg border bg-white px-3 py-2" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)}/></label>
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Sampai bulan</span><input type="month" className="rounded-lg border bg-white px-3 py-2" value={toMonth} onChange={(e) => setToMonth(e.target.value)}/></label>
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Urutkan</span><select className="rounded-lg border bg-white px-3 py-2" value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="name">Nama (A-Z)</option><option value="budgetDesc">Budget tertinggi</option><option value="budgetAsc">Budget terendah</option><option value="dateDesc">Tanggal terbaru</option><option value="dateAsc">Tanggal terlama</option><option value="progressDesc">Progress tertinggi</option><option value="progressAsc">Progress terendah</option></select></label>
      {(statusFilter !== 'all' || fromMonth || toMonth) && <button onClick={() => { setStatusFilter('all'); setFromMonth(''); setToMonth(''); }} className="rounded-lg border bg-white px-3 py-2 text-slate-500">Reset</button>}
    </div>}
    {list.length === 0 && <p className="py-10 text-center text-sm text-slate-400">{tab === 'Arsip' ? 'Arsip kosong.' : 'Tidak ada project yang cocok dengan filter.'}</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map((p) => <ProjectCard key={p.id} project={p} tasks={tasks} archivedView={tab === 'Arsip'} canManage={canManage} canDelete={canDelete} onEdit={onEdit} onArchive={onArchive} onDeletePermanent={onDeletePermanent}/>)}</div>
  </div>;
}
function ProjectCard({ project: p, tasks, archivedView, canManage, canDelete, onEdit, onArchive, onDeletePermanent }: { project: Project; tasks: Task[]; archivedView: boolean; canManage: boolean; canDelete: boolean; onEdit: (p: Project) => void; onArchive: (id: string, archived: boolean) => void; onDeletePermanent: (id: string) => void }) {
  const pr = projectProgress(tasks, p.id);
  const st = PROJECT_STATUS_META[normProjectStatus(p)];
  const fl = p.flag ? FLAG_META[p.flag] : null;
  const startLabel = p.startMonth ? `${monthNames[Number(p.startMonth.slice(5, 7)) - 1]} ${p.startMonth.slice(0, 4)}` : '—';
  return <div onClick={() => { if (!archivedView && canManage) onEdit(p); }} className={`relative rounded-xl border p-4 transition ${!archivedView && canManage ? 'cursor-pointer hover:shadow-md' : ''} ${archivedView ? 'opacity-80' : ''}`}>
    {p.thumbnail && <img src={p.thumbnail} alt="" className="absolute right-3 top-3 h-12 w-12 rounded-xl border object-cover"/>}
    <div className={`mb-1 flex items-center gap-2 ${p.thumbnail ? 'pr-14' : ''}`}><i className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }}/><b className="truncate">{p.name}</b></div>
    <div className={`mb-2 flex flex-wrap items-center gap-1.5 text-xs ${p.thumbnail ? 'pr-14' : ''}`}>
      <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: st.bg, color: st.text }}>{st.label}</span>
      {fl && <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: fl.bg, color: fl.text }}>{p.flag}</span>}
      <span className="text-slate-400">Start: {startLabel}</span>
    </div>
    <p className="mb-3 text-sm text-slate-500">{pr.total} task · {pr.done}/{pr.active} selesai{Number(p.budget) ? ` · ${formatRupiah(p.budget)}` : ''}</p>
    <div className="flex items-center gap-3"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${pr.pct}%`, background: p.color }}/></div><span className="w-10 text-right text-sm font-bold tabular-nums" style={{ color: p.color }}>{pr.pct}%</span></div>
    {archivedView && <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>{canManage && <button onClick={() => onArchive(p.id, false)} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"><RotateCcw size={13}/>Pulihkan</button>}{canDelete && <button onClick={() => { if (window.confirm(`Hapus permanen project "${p.name}"? Tindakan ini tidak bisa dibatalkan.`)) onDeletePermanent(p.id); }} className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600"><Trash2 size={13}/>Hapus Permanen</button>}</div>}
  </div>;
}
function GmapsField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const name = gmapsName(value);
  return <Field label={label}><input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Tempel link Google Maps"/>{value && <a href={value} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"><MapPin size={12}/>{name}</a>}</Field>;
}
function ProjectModal({ form, setForm, requesters, pics, onClose, onSave, onArchive }: { form: Project; setForm: (p: Project) => void; requesters: string[]; pics: string[]; onClose: () => void; onSave: () => void; onArchive: (id: string, archived: boolean) => void }) {
  const distribusi = String(form.distribusi || '').split(',').map((s) => s.trim()).filter(Boolean);
  const toggleDist = (opt: string) => { const next = distribusi.includes(opt) ? distribusi.filter((d) => d !== opt) : [...distribusi, opt]; setForm({ ...form, distribusi: next.join(',') }); };
  const [thumbErr, setThumbErr] = useState('');
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
    <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{form.id ? 'Edit Project' : 'Tambah Project'}</h3><button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100"><X size={18}/></button></div>
      <div className="grid gap-x-4 md:grid-cols-2">
        <Field label="Nama Project *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama project"/></Field>
        <Field label="Start Project (bulan & tahun)"><input type="month" className="input" value={form.startMonth || ''} onChange={(e) => setForm({ ...form, startMonth: e.target.value })}/></Field>
        <Field label="Requester"><select className="input" value={form.requester || ''} onChange={(e) => setForm({ ...form, requester: e.target.value })}><option value="">— Pilih requester —</option>{requesters.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="PIC"><select className="input" value={form.pic || ''} onChange={(e) => setForm({ ...form, pic: e.target.value })}><option value="">— Pilih PIC —</option>{pics.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Output Landscape (jumlah)"><input type="number" min={0} className="input" value={form.outputLandscape ?? ''} onChange={(e) => setForm({ ...form, outputLandscape: e.target.value })} placeholder="0"/></Field>
        <Field label="Output Vertical (jumlah)"><input type="number" min={0} className="input" value={form.outputVertical ?? ''} onChange={(e) => setForm({ ...form, outputVertical: e.target.value })} placeholder="0"/></Field>
        <Field label="Distribusi"><div className="flex gap-4 rounded-xl border px-3 py-2.5">{['Organic', 'Ads'].map((opt) => <label key={opt} className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={distribusi.includes(opt)} onChange={() => toggleDist(opt)}/>{opt}</label>)}</div></Field>
        <Field label="Budget (Rp)"><input inputMode="numeric" className="input" value={Number(form.budget) ? Number(form.budget).toLocaleString('id-ID') : ''} onChange={(e) => setForm({ ...form, budget: parseRupiahInput(e.target.value) })} placeholder="0"/></Field><Field label="Realisasi Biaya (Rp)"><input inputMode="numeric" className="input" value={Number(form.actualCost) ? Number(form.actualCost).toLocaleString('id-ID') : ''} onChange={(e) => setForm({ ...form, actualCost: parseRupiahInput(e.target.value) })} placeholder="0"/></Field>
        <GmapsField label="Lokasi 1" value={form.lokasi1 || ''} onChange={(v) => setForm({ ...form, lokasi1: v })}/>
        <GmapsField label="Lokasi 2" value={form.lokasi2 || ''} onChange={(v) => setForm({ ...form, lokasi2: v })}/>
        <Field label="Folder Project (Google Drive)"><input className="input" value={form.folderLink || ''} onChange={(e) => setForm({ ...form, folderLink: e.target.value })} placeholder="https://drive.google.com/..."/>{form.folderLink && <a href={form.folderLink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"><Link2 size={12}/>Buka folder</a>}</Field>
        <Field label="Skala Project"><div className="flex gap-2">{(['Big', 'Medium', 'Small'] as const).map((f) => { const m = FLAG_META[f]; const on = form.flag === f; return <button type="button" key={f} onClick={() => setForm({ ...form, flag: on ? '' : f })} className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ring-inset ${on ? 'ring-transparent' : 'bg-white ring-slate-200 text-slate-400'}`} style={on ? { background: m.bg, color: m.text } : {}}>{f}</button>; })}</div></Field>
        <Field label="Status Project"><select className="input" value={normProjectStatus(form)} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="Active">Aktif</option><option value="Done">Done</option><option value="Cancel">Cancel</option></select></Field>
        <Field label="Warna"><input type="color" className="h-11 w-full cursor-pointer rounded-xl border px-1" value={form.color || '#38bdf8'} onChange={(e) => setForm({ ...form, color: e.target.value })}/></Field>
        <Field label="Thumbnail"><div className="flex items-center gap-3">{form.thumbnail && <img src={form.thumbnail} alt="" className="h-12 w-12 rounded-xl border object-cover"/>}<input type="file" accept="image/*" className="text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setThumbErr(''); setForm({ ...form, thumbnail: await fileToThumbnail(f) }); } catch { setThumbErr('Gagal memproses gambar.'); } }}/>{form.thumbnail && <button type="button" onClick={() => setForm({ ...form, thumbnail: '' })} className="rounded-lg border px-2 py-1 text-xs text-slate-500">Hapus</button>}</div>{thumbErr && <p className="mt-1 text-xs text-red-600">{thumbErr}</p>}</Field>
        <Field label="Notes" className="md:col-span-2"><textarea className="input min-h-[70px]" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan project"/></Field>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {form.id ? <button onClick={() => onArchive(form.id, true)} className="flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold text-slate-600"><Archive size={15}/>Arsipkan</button> : <span/>}
        <div className="flex gap-2"><button onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Batal</button><button onClick={onSave} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Simpan</button></div>
      </div>
    </div>
  </div>;
}
function TeamPage({ pics, setPics, tasks, projects, canManage, onRenamePic }: { pics: Pic[]; setPics: (p: Pic[]) => void; tasks: Task[]; projects: Project[]; canManage: boolean; onRenamePic: (from: string, to: string) => void }) {
  const [modalMode, setModalMode] = useState<null | 'add' | 'edit'>(null);
  const [original, setOriginal] = useState('');
  const [form, setForm] = useState<Pic>({ name: '', role: '', email: '', color: '#38bdf8', photo: '' });
  const activeProjects = useMemo(() => projects.filter((p) => !isArchived(p) && normProjectStatus(p) === 'Active'), [projects]);
  const activeIds = useMemo(() => new Set(activeProjects.map((p) => p.id)), [activeProjects]);
  const countFor = (name: string) => tasks.filter((t) => t.pic === name && activeIds.has(t.projectId)).length;
  const perProject = (name: string) => activeProjects.map((p) => ({ p, count: tasks.filter((t) => t.pic === name && t.projectId === p.id).length })).filter((x) => x.count > 0);
  const openAdd = () => { if (!canManage) return; setForm({ name: '', role: '', email: '', color: '#38bdf8', photo: '' }); setModalMode('add'); };
  const openDetail = (pic: Pic) => { setForm({ color: '#38bdf8', role: '', email: '', photo: '', ...pic }); setOriginal(pic.name); setModalMode('edit'); };
  const save = () => {
    const name = form.name.trim(); if (!name) return;
    if (modalMode === 'add') { if (pics.some((p) => p.name === name)) return; setPics([...pics, { ...form, name }]); }
    else { if (name !== original && pics.some((p) => p.name === name)) return; setPics(pics.map((p) => p.name === original ? { ...form, name } : p)); if (name !== original) onRenamePic(original, name); }
    setModalMode(null);
  };
  const remove = () => { if (!window.confirm(`Hapus PIC "${original}"? Task lama tetap menyimpan nama ini.`)) return; setPics(pics.filter((p) => p.name !== original)); setModalMode(null); };
  return <div className="rounded-2xl border bg-white p-4 shadow-soft">
    <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">PIC / Team & Workload</h3>{canManage && <button onClick={openAdd} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Plus size={16}/>Tambah PIC</button>}</div>
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{pics.map((pic) => { const count = countFor(pic.name); const color = pic.color || '#38bdf8'; return (
      <button key={pic.name} onClick={() => openDetail(pic)} className="group relative aspect-square overflow-hidden rounded-2xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
        {pic.photo ? <>
          <img src={pic.photo} alt="" className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105"/>
          <div className="absolute inset-0 bg-white/20"/>
        </> : <>
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${tint(color)}, #ffffff)` }}/>
          <span className="absolute -right-1 -top-3 select-none text-8xl font-black opacity-60" style={{ color: tint(color) }}>{pic.name.charAt(0).toUpperCase()}</span>
        </>}
        <div className="absolute inset-x-0 bottom-0 h-4/5 bg-gradient-to-t from-white via-white/90 to-transparent"/>
        <span className="absolute left-0 top-0 h-1.5 w-full" style={{ background: color }}/>
        <div className="absolute inset-x-0 bottom-0 p-3.5">
          <b className="block truncate text-xl leading-tight text-slate-900">{pic.name}</b>
          {pic.role ? <span className="mt-1.5 inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-bold text-slate-800" style={{ background: tint(color) }}>{pic.role}</span> : null}
          <p className={`mt-1.5 text-sm font-bold ${count > 10 ? 'text-red-600' : 'text-slate-800'}`}>{count} task<span className="font-medium text-slate-500"> · Project Aktif</span>{count > 10 ? <span className="text-red-600"> · Overload</span> : null}</p>
        </div>
      </button>
    ); })}</div>
    {modalMode && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setModalMode(null)}>
      <div className="max-h-[92vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{modalMode === 'add' ? 'Tambah PIC' : 'Detail PIC'}</h3><button onClick={() => setModalMode(null)} className="rounded-lg p-1 hover:bg-slate-100"><X size={18}/></button></div>
        <Field label="Nama"><input className="input" value={form.name} disabled={!canManage} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama PIC"/></Field>
        <Field label="Project Role"><input className="input" value={form.role || ''} disabled={!canManage} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="cth: Editor, Scriptwriter, Camera"/></Field><Field label="Email (untuk undangan Google Calendar)"><input className="input" type="email" value={form.email || ''} disabled={!canManage} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@email.com"/></Field>
        <Field label="Warna card"><input type="color" className="h-11 w-full cursor-pointer rounded-xl border px-1" value={form.color || '#38bdf8'} disabled={!canManage} onChange={(e) => setForm({ ...form, color: e.target.value })}/></Field>
        <Field label="Foto (background card)"><div className="flex items-center gap-3">{form.photo && <img src={form.photo} alt="" className="h-14 w-14 rounded-xl border object-cover"/>}{canManage && <input type="file" accept="image/*" className="text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setForm({ ...form, photo: await fileToThumbnail(f, 256) }); } catch { /* abaikan file invalid */ } }}/>}{form.photo && canManage && <button type="button" onClick={() => setForm({ ...form, photo: '' })} className="rounded-lg border px-2 py-1 text-xs text-slate-500">Hapus</button>}</div></Field>
        {modalMode === 'edit' && <div className="mb-4 rounded-xl bg-slate-50 p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Task di Project Aktif · total {countFor(original)}</p>{perProject(original).length === 0 && <p className="text-sm text-slate-400">Tidak ada task di project aktif.</p>}<div className="space-y-1.5">{perProject(original).map(({ p, count }) => <div key={p.id} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }}/>{p.name}</span><b>{count} task</b></div>)}</div></div>}
        {canManage && <div className="flex items-center justify-between gap-2">{modalMode === 'edit' ? <button onClick={remove} className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600"><Trash2 size={15}/>Hapus</button> : <span/>}<div className="flex gap-2"><button onClick={() => setModalMode(null)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Batal</button><button onClick={save} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Simpan</button></div></div>}
      </div>
    </div>}
  </div>;
}
function WorkspaceCard({ settings, setSettings }: { settings: WorkspaceSettings; setSettings: (s: WorkspaceSettings) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorkspaceSettings>(settings);
  useEffect(() => { if (!editing) setDraft(settings); }, [settings, editing]);
  const soundOn = (editing ? draft : settings).notifSound !== 'off';
  return <div className="rounded-2xl border bg-white p-4 shadow-soft">
    <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">Workspace</h3>
      {editing
        ? <div className="flex gap-2"><button onClick={() => setEditing(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold">Batal</button><button onClick={() => { setSettings(draft); setEditing(false); }} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Simpan</button></div>
        : <button onClick={() => { setDraft(settings); setEditing(true); }} className="flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-100"><Save size={14}/>Edit</button>}
    </div>
    <Field label="Nama Workspace"><input className="input disabled:bg-slate-50 disabled:text-slate-500" disabled={!editing} value={draft.workspaceName} onChange={e => setDraft({ ...draft, workspaceName: e.target.value })}/></Field>
    <Field label="Timezone"><input className="input disabled:bg-slate-50 disabled:text-slate-500" disabled={!editing} value={draft.timezone} onChange={e => setDraft({ ...draft, timezone: e.target.value })}/></Field>
    <Field label="Spreadsheet ID"><input className="input disabled:bg-slate-50 disabled:text-slate-500" disabled={!editing} value={draft.spreadsheetId || ''} onChange={e => setDraft({ ...draft, spreadsheetId: e.target.value })}/></Field>
    <Field label="Email Notifikasi Finance (pisahkan dengan koma)"><input className="input disabled:bg-slate-50 disabled:text-slate-500" disabled={!editing} value={draft.financeNotifEmails || ''} onChange={e => setDraft({ ...draft, financeNotifEmails: e.target.value })} placeholder="finance@company.com, lead@company.com"/><p className="mt-1 text-xs text-slate-500">Reminder email harian H-3, H-2, H-1, dan Hari-H untuk task kategori Finance. Aktifkan trigger harian sendFinanceReminders di Apps Script (lihat README).</p></Field>
    <label className={`flex items-center gap-2.5 rounded-xl border p-3 text-sm font-semibold ${editing ? 'cursor-pointer' : 'opacity-70'}`}><input type="checkbox" disabled={!editing} checked={soundOn} onChange={(e) => setDraft({ ...draft, notifSound: e.target.checked ? 'on' : 'off' })}/><Bell size={15}/>Suara lonceng notifikasi (ting-nong tiap 30 menit selama ada notifikasi belum dibuka)</label>
  </div>;
}

function SettingsPage({ settings, setSettings, categories, setCategories, statuses, setStatuses, requesters, setRequesters, users, onSaveUser, onRemoveUser, canManageUsers }: any) { const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [role, setRole] = useState('Member'); const addUser = () => { if (!canManageUsers || !email.trim() || !password.trim()) return; onSaveUser({ id: '', email: email.trim().toLowerCase(), name: name.trim() || email.trim(), role, active: true, team: 'Multimedia' }, password.trim()); setEmail(''); setName(''); setPassword(''); }; return <div className="grid gap-4 xl:grid-cols-2"><WorkspaceCard settings={settings} setSettings={setSettings}/><div className="rounded-2xl border bg-white p-4 shadow-soft"><h3 className="mb-4 text-lg font-bold">Status & Kategori</h3><ListEditor title="Status" items={statuses} setItems={setStatuses}/><ListEditor title="Kategori" items={categories} setItems={setCategories}/><ListEditor title="Requester" items={requesters} setItems={setRequesters}/><p className="text-xs text-slate-400">PIC dikelola lengkap (role, warna, foto) di menu PIC / Team.</p></div><div className="rounded-2xl border bg-white p-4 shadow-soft xl:col-span-2"><h3 className="mb-1 text-lg font-bold">Users & Role Access</h3><p className="mb-4 text-xs text-slate-500">Password disimpan ter-hash di server dan tidak pernah dikirim ke browser. Isi kolom password hanya jika ingin mengganti.</p>{canManageUsers && <div className="mb-4 grid gap-2 md:grid-cols-[1fr_1fr_1fr_160px_120px]"><input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@company.com"/><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Nama"/><input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password"/><select className="input" value={role} onChange={e=>setRole(e.target.value)}><option>Admin</option><option>Manager</option><option>Member</option><option>Viewer</option></select><button onClick={addUser} className="rounded-xl bg-blue-600 px-4 font-semibold text-white">Tambah</button></div>}<div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-3">Nama</th><th>Email</th><th>Role</th><th>Active</th><th>Password</th><th></th></tr></thead><tbody>{users.map((u: AppUser) => <UserRow key={u.id} user={u} canManageUsers={canManageUsers} onSave={onSaveUser} onRemove={onRemoveUser}/>)}</tbody></table></div><p className="mt-3 text-xs text-slate-500">Role: Admin bisa semua, Manager master data tanpa hapus user, Member tambah/edit task, Viewer hanya lihat/export.</p></div></div>; }
function UserRow({ user, canManageUsers, onSave, onRemove }: { user: AppUser; canManageUsers: boolean; onSave: (u: AppUser, pw?: string) => void; onRemove: (id: string) => void }) { const [name, setName] = useState(user.name); const [role, setRole] = useState(user.role); const [active, setActive] = useState(user.active); const [pwd, setPwd] = useState(''); useEffect(() => { setName(user.name); setRole(user.role); setActive(user.active); }, [user]); if (!canManageUsers) return <tr className="border-b"><td className="p-3 font-semibold">{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{String(user.active)}</td><td>{user.hasPassword ? '••••••' : '—'}</td><td/></tr>; return <tr className="border-b align-middle"><td className="p-2"><input className="w-36 rounded-lg border px-2 py-1" value={name} onChange={e=>setName(e.target.value)}/></td><td>{user.email}</td><td><select className="rounded-lg border px-2 py-1" value={role} onChange={e=>setRole(e.target.value)}><option>Admin</option><option>Manager</option><option>Member</option><option>Viewer</option></select></td><td><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/></td><td><input className="w-36 rounded-lg border px-2 py-1" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder={user.hasPassword ? 'ubah password' : 'set password'}/></td><td className="space-x-2 whitespace-nowrap py-2 text-right"><button onClick={()=>{ onSave({ ...user, name, role, active }, pwd || undefined); setPwd(''); }} className="rounded-lg bg-blue-600 px-3 py-1 font-semibold text-white">Simpan</button><button onClick={()=>onRemove(user.id)} className="rounded-lg border border-red-200 px-3 py-1 text-red-600">Hapus</button></td></tr>; }
function ListEditor({ title, items, setItems }: any) { const [val, setVal] = useState(''); const add = () => { const v = val.trim(); if (v && !items.includes(v)) { setItems([...items, v]); setVal(''); } }; return <div className="mb-5"><p className="mb-2 text-sm font-semibold text-slate-600">{title}</p><div className="mb-2 flex gap-2"><input className="input" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder={`Tambah ${title}`}/><button onClick={add} className="rounded-xl border px-4">Tambah</button></div><div className="flex flex-wrap gap-2">{items.map((x: string) => <span key={x} className="group inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-sm">{x}<button title={`Hapus ${x}`} onClick={() => { if (window.confirm(`Hapus "${x}" dari daftar ${title}?`)) setItems(items.filter((i: string) => i !== x)); }} className="grid h-5 w-5 place-items-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600"><X size={12}/></button></span>)}</div></div>; }
const ROBOT_PALETTE: Record<string, string> = { '#': '#334155', c: '#5eead4', s: '#38bdf8', w: '#f8fafc', e: '#0f172a', m: '#fb7185', p: '#f472b6', y: '#fbbf24' };
const R_HEAD = ['....####....', '..##cccc##..', '.#cccccccc#.', '#cwwwwwwwwc#', '#cwwwwwwwwc#', '#cwwwwwwwwc#', '#cwppmmppwc#', '.#cccccccc#.', '..##cccc##..'];
function eyeRects(ox: number, oy: number, cell: number, key: string) { return [[3, 4], [4, 4], [7, 4], [8, 4]].map(([c, r], i) => <rect key={`${key}-eye-${i}`} x={(ox + c) * cell} y={(oy + r) * cell} width={cell + 0.4} height={cell + 0.4} fill={ROBOT_PALETTE.e} />); }
const R_BODY = ['..#ssss#..', '.#ssssss#.', '#ssppppss#', '#ssssssss#', '.#ssssss#.', '..######..'];
const R_ARM = ['ss', 'ss', 'ss', 'pp'];
const R_ANTENNA = ['.yy.', '.yy.', '.##.'];
const R_PIGTAIL = ['pp', 'pp', 'pp', 'pp'];
function pixelRects(map: string[], ox: number, oy: number, cell: number, key: string) {
  const out: React.ReactElement[] = [];
  map.forEach((row, r) => { for (let c = 0; c < row.length; c++) { const ch = row[c]; const fill = ROBOT_PALETTE[ch]; if (!fill) continue; out.push(<rect key={`${key}-${r}-${c}`} x={(ox + c) * cell} y={(oy + r) * cell} width={cell + 0.4} height={cell + 0.4} fill={fill} />); } });
  return out;
}
function RobotFace({ size = 24 }: { size?: number }) {
  const cell = size / 12;
  return <svg width={size} height={size * 9 / 12} viewBox={`0 0 ${12 * cell} ${9 * cell}`} className="shrink-0" aria-hidden>{pixelRects(R_HEAD, 0, 0, cell, 'rf')}{eyeRects(0, 0, cell, 'rf')}</svg>;
}
function RobotMascot() {
  const cell = 6;
  return <svg viewBox="0 0 108 128" width="132" className="rm-svg" role="img" aria-label="Maskot asisten robot">
    <g className="rm-float">
      <g transform="translate(0,26)">
        {pixelRects(R_BODY, 4, 8, cell, 'body')}
        {pixelRects(R_ARM, 2, 9, cell, 'arml')}
        <g className="rm-arm">{pixelRects(R_ARM, 14, 9, cell, 'armr')}</g>
        <g className="rm-head">
          {pixelRects(R_PIGTAIL, 1, 3, cell, 'ptl')}
          {pixelRects(R_PIGTAIL, 15, 3, cell, 'ptr')}
          {pixelRects(R_ANTENNA, 7, -3, cell, 'ant')}
          {pixelRects(R_HEAD, 3, 0, cell, 'head')}
          <g className="rm-eyes">{eyeRects(3, 0, cell, 'head')}</g>
        </g>
      </g>
    </g>
  </svg>;
}

function chatDayLabel(ts: number) { const d = new Date(ts); const now = new Date(); const y = new Date(Date.now() - 86400000); if (d.toDateString() === now.toDateString()) return 'Hari ini'; if (d.toDateString() === y.toDateString()) return 'Kemarin'; return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); }

function AssistantPanel({ currentUser, buildContext, tasks, projects, onOpenTask, onOpenProject }: { currentUser: AppUser | null; buildContext: () => string; tasks: Task[]; projects: Project[]; onOpenTask: (t: Task) => void; onOpenProject: (p: Project) => void }) {
  const storeKey = `timeline-ai-chat-${currentUser?.email || 'anon'}`;
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; ts?: number }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const s = window.localStorage.getItem(storeKey); const arr = (s ? JSON.parse(s) : []) as { role: 'user' | 'assistant'; content: string; ts?: number }[]; const cutoff = Date.now() - 30 * 86400000; setMessages(arr.map((m) => ({ ...m, ts: m.ts || Date.now() })).filter((m) => (m.ts as number) >= cutoff).slice(-200)); } catch { setMessages([]); } }, [storeKey]);
  useEffect(() => { try { window.localStorage.setItem(storeKey, JSON.stringify(messages)); } catch { /* penuh */ } if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, storeKey, loading]);
  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    const next = [...messages, { role: 'user' as const, content: q, ts: Date.now() }];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.slice(-12), context: buildContext() }) });
      const data = await res.json();
      setMessages((m) => [...m, { role: 'assistant', content: res.ok ? data.text : `⚠️ ${data.message || 'Gagal menjawab.'}`, ts: Date.now() }]);
    } catch { setMessages((m) => [...m, { role: 'assistant', content: '⚠️ Koneksi ke asisten gagal.', ts: Date.now() }]); }
    finally { setLoading(false); }
  }
  function renderMsg(text: string) {
    const re = /\[\[(task|project):([^\]]+)\]\]/g;
    const nodes: React.ReactNode[] = []; let last = 0; let mch: RegExpExecArray | null; let k = 0;
    while ((mch = re.exec(text))) {
      if (mch.index > last) nodes.push(text.slice(last, mch.index));
      const kind = mch[1]; const name = mch[2].trim();
      if (kind === 'task') { const t = tasks.find((x) => x.title.toLowerCase() === name.toLowerCase()) || tasks.find((x) => x.title.toLowerCase().includes(name.toLowerCase())); nodes.push(t ? <button key={`c${k++}`} onClick={() => onOpenTask(t)} className="mx-0.5 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 align-baseline text-xs font-semibold text-blue-700 hover:bg-blue-200">! {name}</button> : <b key={`c${k++}`}>{name}</b>); }
      else { const p = projects.find((x) => x.name.toLowerCase() === name.toLowerCase()) || projects.find((x) => x.name.toLowerCase().includes(name.toLowerCase())); nodes.push(p ? <button key={`c${k++}`} onClick={() => onOpenProject(p)} className="mx-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-baseline text-xs font-semibold hover:brightness-95" style={{ background: `${p.color}22`, color: p.color }}><i className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />{name}</button> : <b key={`c${k++}`}>{name}</b>); }
      last = re.lastIndex;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
  }
  const suggestions = ['Ringkas progress bulan ini untuk laporan', 'PIC mana yang paling overload?', 'Task apa saja yang overdue?', 'Bandingkan budget vs realisasi tiap project'];
  return <div className="sticky top-20 flex h-[calc(100vh-80px)] flex-col">
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white"><Sparkles size={16}/></span><div><p className="text-sm font-bold leading-tight">Asisten Timeline</p><p className="text-[11px] text-slate-400">Tanya soal project, task, budget</p></div></div>
      {messages.length > 0 && <button title="Bersihkan percakapan" onClick={() => { if (window.confirm('Hapus riwayat percakapan asisten?')) setMessages([]); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"><Trash2 size={15}/></button>}
    </div>
    <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.length === 0 && <div className="mt-2">
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-800"><Bot size={16} className="shrink-0"/>Aku bisa merangkum data project & task-mu. Coba salah satu:</div>
        <div className="space-y-2">{suggestions.map((s) => <button key={s} onClick={() => send(s)} className="block w-full rounded-xl border px-3 py-2 text-left text-sm hover:bg-slate-50">{s}</button>)}</div>
        <div className="mt-6 flex flex-col items-center"><RobotMascot /><p className="mt-1 text-xs font-medium text-slate-400">Hai! Ailinu siap bantu 👋</p></div>
      </div>}
      {(() => { const nodes: React.ReactNode[] = []; let lastDay = ''; messages.forEach((m, i) => {
        const ts = m.ts || Date.now(); const day = new Date(ts).toDateString();
        if (day !== lastDay) { lastDay = day; nodes.push(<div key={`div-${i}`} className="my-3 flex items-center gap-2 text-[11px] font-medium text-slate-400"><span className="h-px flex-1 bg-slate-100" />{chatDayLabel(ts)}<span className="h-px flex-1 bg-slate-100" /></div>); }
        nodes.push(m.role === 'user'
          ? <div key={i} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-3.5 py-2.5 text-sm text-white">{m.content}</div></div>
          : <div key={i} className="flex items-start justify-start gap-2"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-teal-50 ring-1 ring-teal-100"><RobotFace size={20} /></span><div className="max-w-[80%] whitespace-pre-wrap rounded-2xl border bg-white px-3.5 py-2.5 text-sm text-slate-800">{renderMsg(m.content)}</div></div>);
      }); return nodes; })()}
      {loading && <div className="flex items-start justify-start gap-2"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-teal-50 ring-1 ring-teal-100"><RobotFace size={20} /></span><div className="rounded-2xl border bg-white px-3.5 py-2.5 text-sm text-slate-400">Mengetik…</div></div>}
    </div>
    <div className="border-t p-3">
      <div className="flex items-end gap-2">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Tanya sesuatu… (Enter kirim)" className="max-h-28 flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-blue-500"/>
        <button onClick={() => send()} disabled={loading || !input.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white disabled:opacity-40"><Send size={16}/></button>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-slate-400">Jawaban AI bisa keliru — verifikasi angka penting.</p>
    </div>
  </div>;
}

function TaskDrawer({ task, projects, onClose, onEdit, onDelete }: any) { if (!task) return <aside data-drawer className="border-l bg-white p-6"><button onClick={onClose} className="float-right"><X /></button><p className="mt-12 text-slate-500">Belum ada task dipilih.</p></aside>; const project = projectById(projects, task.projectId); const overdue = isOverdue(task); const due = !overdue && effectiveStatus(task) !== 'Done' && parseIso(task.endDate || task.startDate).getTime() - new Date().getTime() <= 3 * 86400000; return <aside data-drawer className="min-h-[calc(100vh-80px)] border-l bg-white p-6 shadow-soft"><div className="mb-8 flex items-center justify-between"><h3 className="text-lg font-bold">Detail Task</h3><button onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X size={18}/></button></div><p className="mb-4 flex items-center gap-2 text-sm font-semibold" style={{ color: project.color }}><i className="h-3 w-3 rounded-full" style={{ background: project.color }} />{project.name}</p><h2 className="mb-4 text-2xl font-bold leading-tight">{task.title}</h2>{overdue && <div className="mb-4 flex gap-2 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700"><AlertTriangle size={18}/>Sudah lewat deadline (Overdue)</div>}{due && <div className="mb-4 flex gap-2 rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange-700"><AlertTriangle size={18}/>Deadline mendekat</div>}<Detail label="Tanggal" value={`${task.startDate}${task.endDate ? ` - ${task.endDate}` : ''}`} /><Detail label="Jam" value={`${task.startTime || '-'}${task.endTime ? ` - ${task.endTime}` : ''}`} /><Detail label="PIC" value={task.pic} /><div className="mb-5 border-b pb-4"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Status</p><div className="mt-1 flex items-center gap-2">{(() => { const m = statusMeta(displayStatus(task)); return <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold" style={{ background: m.bg, color: m.text }}><i className="h-2 w-2 rounded-full" style={{ background: m.dot }} />{displayStatus(task)}</span>; })()}<span className="text-xs text-slate-400">{task.statusMode === 'auto' ? 'mode otomatis (ikuti tanggal)' : 'mode manual'}</span></div></div><Detail label="Kategori" value={task.category} /><Detail label="Deskripsi" value={task.notes || '-'} /><div className="mb-5 border-b pb-4"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Attachment / Link</p>{task.link ? <a href={/^https?:\/\//i.test(task.link) ? task.link : `https://${task.link}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 break-all text-sm font-semibold text-blue-600 hover:underline"><Link2 size={14} className="shrink-0"/>{task.link}</a> : <p className="text-sm text-slate-700">-</p>}</div>{(task.meetLink || task.invite) && <div className="mb-5 border-b pb-4"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Google Meet</p>{task.meetLink ? <a href={task.meetLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 break-all text-sm font-semibold text-emerald-600 hover:underline"><Video size={14} className="shrink-0"/>Gabung Google Meet</a> : <p className="text-sm text-slate-500">Event dibuat, link Meet belum tersedia (aktifkan Advanced Calendar Service untuk Meet otomatis).</p>}{task.invite ? <p className="mt-1 text-xs text-slate-500">Diundang: {task.invite}</p> : null}</div>}<div className="fixed bottom-0 right-0 flex w-full gap-3 border-t bg-white p-4 xl:w-[360px]"><button onClick={() => onEdit(task)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold hover:bg-slate-100"><Save size={16}/>Edit</button><button onClick={() => onDelete(task.id)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-600 hover:bg-red-50"><Trash2 size={16}/>Hapus</button></div></aside>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="mb-5 border-b pb-4"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="text-sm leading-relaxed text-slate-700">{value}</p></div>; }
function TaskModal({ form, setForm, onClose, onSave, projects, pics, categories, statuses }: any) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-soft"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">{form.id ? 'Edit Task' : 'Tambah Task'}</h2><button onClick={onClose}><X /></button></div><div className="grid gap-3 md:grid-cols-2"><Field className="md:col-span-2" label="Judul task"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Contoh: Presentasi Internal Video" className="input" /></Field><Field label="Project"><select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="input">{projects.map((project: Project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field><Field label="PIC"><select value={form.pic} onChange={(e) => setForm({ ...form, pic: e.target.value })} className="input">{pics.map((pic: string) => <option key={pic}>{pic}</option>)}</select></Field><Field label="Tanggal mulai"><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" /></Field><Field label="Tanggal selesai"><input type="date" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input" /></Field><Field label="Jam mulai"><select value={form.startTime || ''} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="input"><option value="">—</option>{TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field><Field label="Jam selesai"><select value={form.endTime || ''} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="input"><option value="">—</option>{TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field><Field label="Status"><select disabled={form.statusMode === 'auto'} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })} className="input disabled:cursor-not-allowed disabled:opacity-50">{statuses.map((status: string) => <option key={status}>{status}</option>)}</select><label className="mt-2 flex items-start gap-2 text-xs font-medium text-slate-600"><input type="checkbox" className="mt-0.5" checked={form.statusMode === 'auto'} onChange={(e) => setForm({ ...form, statusMode: e.target.checked ? 'auto' : 'manual' })} />Otomatis ikuti tanggal (Planned sebelum mulai, Progress saat berjalan, merah bila lewat deadline)</label></Field><Field label="Kategori"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">{categories.map((category: string) => <option key={category}>{category}</option>)}</select></Field><Field className="md:col-span-2" label="Catatan"><textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-24" /></Field><Field className="md:col-span-2" label="Link"><input value={form.link || ''} onChange={(e) => setForm({ ...form, link: e.target.value })} className="input" /></Field>{String(form.category || '').toLowerCase() === 'meeting' && <Field className="md:col-span-2" label="Invite (email, pisah koma) — untuk Google Calendar"><input value={form.invite || ''} onChange={(e) => setForm({ ...form, invite: e.target.value })} placeholder="orang1@email.com, orang2@email.com" className="input" /><p className="mt-1 text-xs text-slate-500">Secara default SEMUA PIC (menu PIC/Team) yang punya email otomatis diundang. Kolom ini khusus untuk mengundang orang DI LUAR menu PIC. Task Meeting dibuatkan event di kalender "Timeline Meetings" (default 10:00, 1 jam bila jam kosong).{form.meetLink ? <> Link Meet: <a href={form.meetLink} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline">buka</a>.</> : null}</p></Field>}</div><div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="rounded-xl border px-5 py-3 font-semibold">Batal</button><button onClick={onSave} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Simpan Task</button></div></div></div>; }
function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`mb-3 block ${className}`}><span className="mb-1 block text-sm font-semibold text-slate-600">{label}</span>{children}</label>; }
