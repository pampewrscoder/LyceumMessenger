export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: "user" | "admin";
  isBanned: boolean;
  lastSeen: string | null;
}

export interface Participant { user: UserProfile; }

export interface ReactionOut {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ReplyPreview {
  id: number;
  content: string;
  senderDisplayName: string;
  fileName: string | null;
}

export interface Message {
  id: number;
  chatId: number;
  content: string;
  encryptedContent: string | null;
  contentIv: string | null;
  myEncryptedKey: string | null;
  createdAt: string;
  sender: UserProfile;
  fileUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  replyTo: ReplyPreview | null;
  isDeleted: boolean;
  isEdited: boolean;
  editedAt: string | null;
  reactions: ReactionOut[];
}

export interface ChatPreview {
  id: number;
  name: string | null;
  isGroup: boolean;
  createdAt: string;
  participants: Participant[];
  lastMessage: Message | null;
  unreadCount: number;
}

export interface ChatDetails {
  id: number;
  name: string | null;
  isGroup: boolean;
  createdAt: string;
  participants: Participant[];
}

export interface ChatsSummary {
  totalChats: number;
  totalGroups: number;
  totalDirects: number;
  totalUnread: number;
  messagesLast7Days: number;
}

export interface TypingStatus {
  userIds: string[];
  displayNames: string[];
}

export interface UploadResult {
  objectPath: string;
  fileName: string;
  contentType: string;
}

export interface MyKeysResponse {
  publicKey: string;
  encryptedPrivateKey: string;
  keySalt: string;
  keyIv: string;
}

export interface PublicKeyResponse {
  publicKey: string;
}

export interface SaveKeysRequest {
  publicKey: string;
  encryptedPrivateKey: string;
  keySalt: string;
  keyIv: string;
}

export interface SendMessageData {
  content?: string;
  encryptedContent?: string | null;
  contentIv?: string | null;
  encryptedKeys?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  replyToId?: number | null;
}

export interface Report {
  id: number;
  messageId: number;
  reporterId: string;
  reason: string;
  description: string | null;
  status: string;
  createdAt: string;
  messageContent: string;
  messageSender: UserProfile;
  reporter: UserProfile;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export const REPORT_REASONS = ["spam", "harassment", "inappropriate", "other"] as const;

export interface AdminStats {
  totalUsers: number;
  activeUsers24h: number;
  totalChats: number;
  totalMessages: number;
  messagesToday: number;
  messagesWeek: number[];
  newUsersWeek: number[];
}

export interface AdminChat {
  id: number;
  name: string | null;
  isGroup: boolean;
  createdAt: string;
  participantCount: number;
  messageCount: number;
  participants: { id: string; displayName: string }[];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); detail = b.detail ?? b.error ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    apiFetch<UserProfile>("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string, displayName: string) =>
    apiFetch<UserProfile>("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName }) }),
  logout: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
  me: () => apiFetch<UserProfile>("/api/auth/me"),
  updateProfile: (data: { displayName?: string; avatarUrl?: string | null }) =>
    apiFetch<UserProfile>("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),

  // users
  searchUsers: (q: string) => apiFetch<UserProfile[]>(`/api/users/search?q=${encodeURIComponent(q)}`),
  heartbeat: () => fetch("/api/users/heartbeat", { method: "POST", credentials: "include" }).catch(() => {}),

  // chats
  listChats: () => apiFetch<ChatPreview[]>("/api/chats"),
  getChat: (chatId: number) => apiFetch<ChatDetails>(`/api/chats/${chatId}`),
  getChatsSummary: () => apiFetch<ChatsSummary>("/api/chats/summary"),
  createChat: (participantIds: string[], name?: string | null) =>
    apiFetch<ChatDetails>("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantIds, name }) }),

  // e2ee keys
  saveKeys: (data: SaveKeysRequest) =>
    apiFetch<{ ok: boolean }>("/api/auth/keys", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  getMyKeys: () => apiFetch<MyKeysResponse | null>("/api/auth/keys/me"),
  getPublicKey: (userId: string) => apiFetch<PublicKeyResponse | null>(`/api/auth/keys/${userId}`),

  // messages
  listMessages: (chatId: number) => apiFetch<Message[]>(`/api/chats/${chatId}/messages`),
  sendMessage: (chatId: number, data: SendMessageData) =>
    apiFetch<Message>(`/api/chats/${chatId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  editMessage: (chatId: number, msgId: number, content: string) =>
    apiFetch<Message>(`/api/chats/${chatId}/messages/${msgId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) }),
  deleteMessage: (chatId: number, msgId: number) =>
    apiFetch<Message>(`/api/chats/${chatId}/messages/${msgId}`, { method: "DELETE" }),
  reactMessage: (chatId: number, msgId: number, emoji: string) =>
    apiFetch<ReactionOut[]>(`/api/chats/${chatId}/messages/${msgId}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) }),

  // typing
  setTyping: (chatId: number) => fetch(`/api/chats/typing/${chatId}`, { method: "POST", credentials: "include" }).catch(() => {}),
  getTyping: (chatId: number) => apiFetch<TypingStatus>(`/api/chats/typing/${chatId}`),

  // storage
  uploadFile: async (file: File): Promise<UploadResult> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/storage/upload", { method: "POST", credentials: "include", body: form });
    if (!res.ok) { let d = `HTTP ${res.status}`; try { const b = await res.json(); d = b.detail ?? d; } catch { /**/ } throw new Error(d); }
    const data = await res.json();
    return { objectPath: data.object_path, fileName: data.file_name, contentType: data.content_type };
  },
  fileUrl: (path: string | null | undefined): string | undefined => {
    if (!path) return undefined;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return `/api/storage${path}`;
  },

  // reports
  reportMessage: (chatId: number, msgId: number, reason: string, description?: string) =>
    apiFetch<{ ok: boolean }>(`/api/chats/${chatId}/messages/${msgId}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, description }) }),

  // admin
  adminStats: () => apiFetch<AdminStats>("/api/admin/stats"),
  adminUsers: () => apiFetch<UserProfile[]>("/api/admin/users"),
  adminUpdateUser: (userId: string, data: { role?: string; isBanned?: boolean; displayName?: string }) =>
    apiFetch<UserProfile>(`/api/admin/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  adminChats: () => apiFetch<AdminChat[]>("/api/admin/chats"),
  adminDeleteChat: (chatId: number) => apiFetch<void>(`/api/admin/chats/${chatId}`, { method: "DELETE" }),
  adminClearMessages: (userId: string) => apiFetch<{ deleted: number }>(`/api/admin/users/${userId}/messages`, { method: "DELETE" }),
  adminReports: (status?: string) => apiFetch<Report[]>(`/api/admin/reports${status ? `?status=${status}` : ""}`),
  adminResolveReport: (reportId: number, status: string) =>
    apiFetch<void>(`/api/admin/reports/${reportId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }),
};
