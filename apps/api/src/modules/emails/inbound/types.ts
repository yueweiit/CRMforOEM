import type { ImapFlow } from "imapflow";

export type ConnectionStatus = "connecting" | "idle" | "fetching" | "reconnecting" | "disconnected" | "auth_failed";

export type ManagedConnection = {
  client: ImapFlow;
  status: ConnectionStatus;
  account: ImapAccount;
  retryCount: number;
  manualStop: boolean;
  retryTimer?: ReturnType<typeof setTimeout>;
  lastError?: string;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
  nextReconnectAt?: Date;
};

export type ImapAccount = {
  id: string;
  name?: string;
  email?: string;
  isActive?: boolean;
  lastSyncAt?: Date | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  imapPasswordEncrypted: string;
  user: { organizationId: string };
};

export type SyncMode = "idle" | "managed" | "temporary";

export type AccountSyncResult = {
  accountId: string;
  email?: string;
  mode: SyncMode | "skipped";
  status: "success" | "skipped" | "failed";
  connectionStatus?: ConnectionStatus;
  scanned: number;
  enqueued: number;
  reason?: string;
};

export type FetchContext = {
  account: ImapAccount;
  client: ImapFlow;
  mode: SyncMode;
};
