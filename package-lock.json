export type Status = 'Planned' | 'Progress' | 'Waiting' | 'Review' | 'Done' | 'Canceled' | string;

export type ProjectFlag = 'Big' | 'Medium' | 'Small' | '';

export type Pic = {
  name: string;
  role?: string;
  email?: string;
  status?: string;
  color?: string;
  photo?: string; // data URL kecil
};

export type Project = {
  id: string;
  name: string;
  color: string;
  status?: string; // Active | Done | Cancel
  startMonth?: string; // YYYY-MM
  requester?: string;
  pic?: string;
  outputLandscape?: number | string;
  outputVertical?: number | string;
  distribusi?: string; // "Organic", "Ads", atau "Organic,Ads"
  lokasi1?: string;
  lokasi2?: string;
  folderLink?: string;
  budget?: number | string;
  actualCost?: number | string;
  flag?: ProjectFlag;
  thumbnail?: string; // data URL kecil
  notes?: string;
  archived?: boolean | string;
  description?: string;
};

export type Task = {
  id: string;
  title: string;
  projectId: string;
  pic: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  status: Status;
  statusMode?: 'auto' | 'manual';
  category: string;
  invite?: string;
  meetLink?: string;
  calendarEventId?: string;
  notes?: string;
  link?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TaskPayload = Partial<Pick<Task, 'id' | 'createdAt' | 'updatedAt'>> & Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

export type UserRole = 'Admin' | 'Manager' | 'Member' | 'Viewer' | string;

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  password?: string;
  hasPassword?: boolean;
  team?: string;
};

export type WorkspaceSettings = {
  workspaceName: string;
  timezone: string;
  syncInterval: string;
  spreadsheetId: string;
  financeNotifEmails?: string;
  notifSound?: string; // 'on' | 'off'
};

export type SheetData = {
  tasks: Task[];
  projects: Project[];
  pics: Pic[];
  categories: string[];
  statuses: string[];
  requesters?: string[];
  settings?: WorkspaceSettings;
  users?: AppUser[];
};
