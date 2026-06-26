export type Status = 'Planned' | 'Progress' | 'Waiting' | 'Review' | 'Done' | 'Canceled' | string;

export type Project = {
  id: string;
  name: string;
  color: string;
  status?: string;
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
  category: string;
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
  team?: string;
};

export type WorkspaceSettings = {
  workspaceName: string;
  timezone: string;
  syncInterval: string;
  spreadsheetId: string;
};

export type SheetData = {
  tasks: Task[];
  projects: Project[];
  pics: string[];
  categories: string[];
  statuses: string[];
  settings?: WorkspaceSettings;
  users?: AppUser[];
};
