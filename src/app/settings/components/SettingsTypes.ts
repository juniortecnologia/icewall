export interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AuditLogItem {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
  createdAt: number;
}

export interface SystemData {
  version: string;
  edition: string;
  tenant: string;
  plan: string;
  git: {
    branch: string;
    commit: string;
    dirty: boolean;
  };
  nodeVersion: string;
  platform: string;
  uptimeSeconds: number;
  stats: {
    clusters: number;
    users: number;
  };
  license: {
    status: string;
    tier: string;
    issuedTo: string;
    expiresAt: string;
  };
}

export interface NotificationConfig {
  discordWebhook: string;
  slackWebhook: string;
  emailAlertsEnabled: boolean;
  alertEmail: string;
  notifyOnGpuThreshold: boolean;
  gpuThresholdPct: number;
  notifyOnContainerFail: boolean;
  notifyOnJevAnomaly: boolean;
}

export interface SettingsSection {
  id: "users" | "notifications" | "audit" | "system";
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}

export interface ToastMessage {
  type: "success" | "error";
  text: string;
}