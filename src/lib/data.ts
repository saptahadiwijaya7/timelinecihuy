import { AppUser, Project, Task, WorkspaceSettings } from './types';

export const projects: Project[] = [
  { id: 'propin', name: 'PROPIN', color: '#facc15', status: 'Active' },
  { id: 'proris', name: 'PRORIS', color: '#fb923c', status: 'Active' },
  { id: 'knowledge-base', name: 'Knowledge Base', color: '#ec4899', status: 'Active' },
  { id: 'campaign', name: 'Campaign', color: '#22d3ee', status: 'Active' },
  { id: 'internal', name: 'Internal', color: '#4ade80', status: 'Active' },
  { id: 'event', name: 'Event', color: '#8b5cf6', status: 'Active' },
  { id: 'lainnya', name: 'Lainnya', color: '#94a3b8', status: 'Active' }
];

export const pics = ['Admin', 'Ayu', 'Dimas Setiawan', 'Iva', 'Tim Design', 'Tim Video', 'Badut Balon'];
export const categories = ['Briefing', 'Campaign', 'Shooting', 'Editing', 'Meeting', 'Review', 'Knowledge Base', 'Event', 'Design'];
export const statuses = ['Planned', 'Progress', 'Waiting', 'Review', 'Done', 'Canceled'];

export const users: AppUser[] = [
  { id: 'u-1', email: 'branding@cpssoft.com', name: 'Accurate Branding', role: 'Admin', active: true, password: 'admin123', team: 'Multimedia' },
  { id: 'u-2', email: 'admin@example.com', name: 'Admin Demo', role: 'Admin', active: true, password: 'admin123', team: 'Multimedia' },
  { id: 'u-3', email: 'manager@example.com', name: 'Manager Demo', role: 'Manager', active: true, password: 'manager123', team: 'Multimedia' },
  { id: 'u-4', email: 'member@example.com', name: 'Member Demo', role: 'Member', active: true, password: 'member123', team: 'Multimedia' },
  { id: 'u-5', email: 'viewer@example.com', name: 'Viewer Demo', role: 'Viewer', active: true, password: 'viewer123', team: 'Management' }
];

export const settings: WorkspaceSettings = {
  workspaceName: 'Timeline Project',
  timezone: 'Asia/Jakarta',
  syncInterval: 'Manual',
  spreadsheetId: ''
};

export const seedTasks: Task[] = [
  { id: '1', title: 'Konten Launch Propin', projectId: 'propin', pic: 'Ayu', startDate: '2026-06-01', endDate: '2026-06-07', startTime: '09:00', endTime: '17:00', status: 'Progress', category: 'Campaign', notes: 'Brief, shooting, dan editing konten launch produk.', link: 'https://example.com/brief' },
  { id: '2', title: 'Test Asset Townhall', projectId: 'knowledge-base', pic: 'Dimas Setiawan', startDate: '2026-06-25', endDate: '2026-06-25', status: 'Planned', category: 'Knowledge Base', notes: 'Testing asset presentasi internal.' },
  { id: '3', title: 'KB Juni #2', projectId: 'knowledge-base', pic: 'Iva', startDate: '2026-06-26', endDate: '2026-06-26', status: 'Progress', category: 'Knowledge Base', notes: 'Update materi knowledge base.' },
  { id: '4', title: 'Shooting Campaign Proris', projectId: 'proris', pic: 'Tim Video', startDate: '2026-07-03', endDate: '2026-07-05', status: 'Planned', category: 'Shooting', notes: 'Produksi konten campaign.' },
  { id: '5', title: 'Review Asset Internal', projectId: 'internal', pic: 'Tim Design', startDate: '2026-07-08', endDate: '2026-07-10', status: 'Review', category: 'Review', notes: 'Review asset sebelum publish.' },
  { id: '6', title: 'Event Ngopdar', projectId: 'event', pic: 'Admin', startDate: '2026-08-12', endDate: '2026-08-13', status: 'Planned', category: 'Event', notes: 'Persiapan dan dokumentasi event.' },
  { id: '7', title: 'Editing Video Campaign', projectId: 'campaign', pic: 'Tim Video', startDate: '2026-08-17', endDate: '2026-08-23', status: 'Waiting', category: 'Editing', notes: 'Editing batch video campaign.' },
  { id: '8', title: 'Presentasi CEO', projectId: 'internal', pic: 'Admin', startDate: '2026-09-04', endDate: '2026-09-04', status: 'Done', category: 'Meeting', notes: 'Deck dan presentasi internal.' }
];
