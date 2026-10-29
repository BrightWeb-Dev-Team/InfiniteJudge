export type Problem = {
  id: string;
  title: string;
  difficulty: "入门" | "简单" | "中等" | "困难";
  tags: string[];
  acceptance: number;
  submissions: number;
  time_limit: number;
  memory_limit: number;
  description?: string;
  input_format?: string;
  output_format?: string;
  sample_input?: string;
  sample_output?: string;
  anti_cheat_enabled?: number;
  anti_cheat_limit?: number;
  integrity_enabled?: number;
  integrity_summary_limit?: number;
  hidden?: number;
  spj_enabled?: number;
  spj_source?: string;
  question_type?: "programming" | "single" | "multiple" | "judge" | "objective";
  objective_options?: string[];
  objective_answer?: string[];
  objective_items?: Array<{ type: "single" | "multiple" | "judge"; options: string[]; answer?: string[] }>;
  source_domain?: string;
};
export type DomainRole = { id: number; name: string; permissions: Record<string, boolean> };
export type DomainPermissionMatrix = { domain_id: number; guest: Record<string, boolean>; member: Record<string, boolean>; root: Record<string, boolean>; roles: DomainRole[] };
export type MyPermissions = { domain_id: number | null; role: string; is_root: boolean; permissions: Record<string, boolean>; domains?: Array<{ id: number; name: string; role: string }> };
export type IntegrityViolation = { at: number; reason: string; weight: number; detail: string };
export type IntegritySession = { active: boolean; session_id?: number; watermark?: string; checksum?: string; blank_lines?: string[]; assets_frozen_at?: string; score?: number; threshold?: number; verdict?: string; summary?: string; ban?: string; ban_token?: string; max_age_ms?: number; code_hash?: string; fingerprint?: string; statement?: { description: string; input_format: string; output_format: string } };
export type IntegrityRun = { runner: "stdin" | "argv" | "input_file"; prompt: string; out?: string; answer?: string; expected?: string; code_hash?: string; deadline_ms?: number; stored?: boolean };
export type IntegrityAdminSession = { id: number; user_id: number; username: string; problem_id: string; language: string; score: number; verdict: string; baseline?: string; created_at: string; updated_at: string; violations: IntegrityViolation[] };
export type Submission = {
  id: number;
  problem_id: string;
  problem?: string;
  title?: string;
  user: string;
  status: string;
  score: number;
  language: string;
  time_ms: number | null;
  memory_kb: number | null;
  created_at: string;
};
export type User = { id: number; username: string; role: string; avatar?: string; rp?: number; bio?: string; custom_css?: string; custom_html?: string; custom_head?: string; custom_script?: string };
export type CallSignalType = "offer" | "answer" | "ice" | "reject" | "hangup" | "busy";
export type CallSignal = {
  id: number;
  sender_id: number;
  recipient_id: number;
  call_id: string;
  type: CallSignalType;
  payload: any;
  sender: string;
  sender_avatar?: string;
};
export type UserFile = { id: number; user_id?: number; original_name: string; mime_type: string; size: number; created_at: string; public_url: string };
export type Certification = { id: number; kind: "programming" | "personal"; title: string; display_text: string; color: string };
export type PublicProfile = User & { created_at: string; submissions: number; solved: number; certifications?: Certification[]; blog: any[]; recent_submissions?: any[] };
export type CountdownConfig = { id?: number; title: string; target: string };
export type SiteConfig = { name: string; serviceUrl: string; logo: string; licenseTier?: "community" | "professional"; announcement?: string; homeAnnouncement?: string; domainAnnouncement?: string; announcementPopup?: boolean; announcementStartsAt?: string; announcementEndsAt?: string; carousel?: Array<{ image: string; title?: string; link?: string }>; carouselInterval?: number; pagination?: { problems?: number } };
export type Auth0Config = {
  enabled: boolean;
  domain: string;
  clientId: string;
  /** The server returns an empty value; a blank input preserves the saved secret. */
  clientSecret: string;
  clientSecretConfigured: boolean;
  callbackUrl: string;
};
export type AiConfig = {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs?: number;
  apiKeyConfigured: boolean;
  hasApiKey?: boolean;
  apiKeyMasked?: string;
  /** The server deliberately returns an empty value here; the secret stays server-side. */
  apiKey?: string;
};
export type AiPublicConfig = { enabled: boolean; provider: string; model: string };
export type AiConversation = { id: number; title: string; created_at: string; updated_at: string; message_count?: number };
export type AiConversationDetail = AiConversation & { messages: Array<{ id: number; role: "user" | "assistant"; content: string; created_at: string }> };
export type SystemHealth = {
  ok: boolean;
  judge: any;
  plugins: any[];
  database: string;
  queue: { pending: number; total: number };
  uptime: number;
  servers?: Array<{ id: string; status: string; system: string; cpu: string; memory_used: number; memory_total: number; handled_requests: number; uptime: number }>;
};
export type Contest = {
  id: number;
  title: string;
  type: string;
  starts_at: string;
  duration: number;
  description: string;
  rule_set?: string;
  team_size?: number;
  solving_duration?: number;
  hack_duration?: number;
  personal_problem_count?: number;
  team_problem_count?: number;
  mystery_problem?: number;
  team_mode?: "admin" | "invite" | "hybrid";
  team_assignments_text?: string;
  problems?: Array<{ id: string; title: string }>;
};
export type Discussion = {
  id: number;
  title: string;
  content: string;
  username: string;
  created_at: string;
  updated_at: string;
  replies: number | Array<any>;
};
export type FriendUser = { id: number; username: string; avatar: string; bio?: string; created_at?: string };
export type FriendRelation = "none" | "friend" | "pending_out" | "pending_in";
export type FriendRequest = {
  id: number;
  user_id: number;
  username: string;
  avatar: string;
  created_at: string;
  direction: "in" | "out";
};
export type FriendGroups = {
  friends: FriendUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};
export type MomentComment = {
  id: number;
  user_id: number;
  username: string;
  avatar: string;
  content: string;
  created_at: string;
};
export type Moment = {
  id: number;
  user_id: number;
  username: string;
  avatar: string;
  content: string;
  images: string[];
  created_at: string;
  likes: Array<{ user_id: number; username: string }>;
  comments: MomentComment[];
  liked: boolean;
  mine: boolean;
};
const token = () => localStorage.getItem("ij-token");
const elevation = () => sessionStorage.getItem("ij-admin-verification");
const domain = () => localStorage.getItem("ij-domain-id");
// Elevation tokens live in server memory, so a restart or the 4-hour expiry invalidates them.
// Drop the stale token everywhere and let the app reopen the verification modal.
function elevationExpired() {
  sessionStorage.removeItem("ij-admin-verification");
  sessionStorage.removeItem("ij-admin-verification-expires");
  dispatchEvent(new CustomEvent("ij-admin-reverify"));
}
async function request<T>(url: string, init: RequestInit = {}) {
  const res = await fetch("/api" + url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(elevation() ? { "X-Admin-Verification": elevation()! } : {}),
      ...(domain() ? { "X-Domain-ID": domain()! } : {}),
      ...init.headers,
    },
  });
  const data = await parseResponse(res);
  // A thrown error used to be discarded here, so callers received the error body as if it
  // were data (e.g. a switch that failed still stored `undefined` as the new token).
  if (!res.ok) {
    if (data.code === "ADMIN_REVERIFY") elevationExpired();
    throw Object.assign(new Error(data.error || "请求失败"), { status: res.status, code: data.code, permission: data.permission });
  }
  return data as T;
}
async function upload<T>(url: string, form: FormData) {
  const res = await fetch("/api" + url, { method: "POST", body: form, headers: { ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(elevation() ? { "X-Admin-Verification": elevation()! } : {}), ...(domain() ? { "X-Domain-ID": domain()! } : {}) } });
  const data = await parseResponse(res);
  if (!res.ok) {
    if (data.code === "ADMIN_REVERIFY") elevationExpired();
    throw new Error(data.error || "上传失败");
  }
  return data as T;
}
async function parseResponse(res: Response) {
  const text = await res.text();
  if (!text) return {} as any;
  try {
    return JSON.parse(text);
  } catch {
    const html = /^\s*<!doctype\s+html|^\s*<html[\s>]/i.test(text);
    throw new Error(html
      ? `服务器返回了网页而不是 API 数据（HTTP ${res.status}）。请确认前后端端口及 /api 反向代理配置。`
      : `服务器返回了无法解析的数据（HTTP ${res.status}）。`);
  }
}
export const api = {
  setupStatus: () => request<{ installed: boolean }>("/setup/status"),
  version: () => request<{ version: string; source: "remote" | "local" }>("/version"),
  setup: (body: any) => request<{ token: string; user: User }>("/setup", { method: "POST", body: JSON.stringify(body) }),
  authConfig: () => request<{ emailVerification: boolean; auth0?: { enabled: boolean } }>("/auth/config"),
  sendEmailCode: (email: string) => request<{ ok: boolean }>("/auth/email-code", { method: "POST", body: JSON.stringify({ email }) }),
  problems: () => request<Problem[]>("/problems"),
  problem: (id: string) => request<Problem>("/problems/" + encodeURIComponent(id)),
  contestProblem: (contestId: number, problemId: string) => request<Problem>(`/contests/${contestId}/problems/${encodeURIComponent(problemId)}`),
  contests: () => request<Contest[]>("/contests"),
  contest: (id: number) => request<Contest>("/contests/" + id),
  contestRanking: (id: number) => request<any>(`/contests/${id}/ranking`),
  updateContestRankingScore: (id: number, subjectId: number, problemId: string, score: number) => request<any>(`/admin/contests/${id}/ranking-score`, { method: "PUT", body: JSON.stringify({ subject_id: subjectId, problem_id: problemId, score }) }),
  oilState: (id: number) => request<any>(`/contests/${id}/oil/state`),
  oilJoin: (id: number) => request<any>(`/contests/${id}/oil/join`, { method: "POST" }),
  oilInvite: (id: number) => request<{ token: string; teamNo: number }>(`/contests/${id}/oil/invite`, { method: "POST" }),
  oilJoinInvite: (id: number, token: string) => request<any>(`/contests/${id}/oil/invite/${encodeURIComponent(token)}/join`, { method: "POST" }),
  oilTransferCaptain: (id: number, userId: number) => request<any>(`/contests/${id}/oil/team/captain`, { method: "PUT", body: JSON.stringify({ userId }) }),
  oilKickMember: (id: number, userId: number) => request<void>(`/contests/${id}/oil/team/members/${userId}`, { method: "DELETE" }),
  oilDisbandTeam: (id: number) => request<void>(`/contests/${id}/oil/team`, { method: "DELETE" }),
  oilLock: (id: number) => request<any>(`/contests/${id}/oil/lock`, { method: "POST" }),
  oilProblems: (id: number) => request<any>(`/contests/${id}/oil/problems`),
  oilChat: (id: number) => request<any[]>(`/contests/${id}/oil/chat`),
  sendOilChat: (id: number, content: string) => request<any>(`/contests/${id}/oil/chat`, { method: "POST", body: JSON.stringify({ content }) }),
  oilHackTargets: (id: number) => request<any>(`/contests/${id}/oil/hack-targets`),
  submitOilHack: (id: number, submissionId: number, input: string, subtask = "") => request<any>(`/contests/${id}/oil/hacks`, { method: "POST", body: JSON.stringify({ submissionId, input, subtask }) }),
  learning: (kind: "training" | "homework") => request<any[]>(`/learning/${kind}`),
  learningDetail: (kind: "training" | "homework", id: number) => request<any>(`/learning/${kind}/${id}`),
  createLearning: (kind: "training" | "homework", body: any) => request<any>(`/admin/learning/${kind}`, { method: "POST", body: JSON.stringify(body) }),
  updateLearning: (kind: "training" | "homework", id: number, body: any) => request<any>(`/admin/learning/${kind}/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteLearning: (kind: "training" | "homework", id: number) => request<void>(`/admin/learning/${kind}/${id}`, { method: "DELETE" }),
  submissions: () => request<Submission[]>("/submissions"),
  submission: (id: number) => request<any>("/submissions/" + id),
  submit: (body: { problem_id: string; language?: string; source?: string; answer?: any[]; contest_id?: number }) =>
    request<{ id: number; status: string }>("/submissions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reportFocus: (problemId: string, contestId?: number) => request<{ count: number; blocked: boolean }>(`/problems/${encodeURIComponent(problemId)}/focus`, { method: "POST", body: JSON.stringify({ contest_id: contestId }) }),
  integrityStart: (problemId: string, body: { language: string; contest_id?: number }) => request<IntegritySession>(`/problems/${encodeURIComponent(problemId)}/integrity/start`, { method: "POST", body: JSON.stringify(body) }),
  integrityEvent: (problemId: string, events: Array<Record<string, unknown>>) => request<{ recorded: number; risk: number; verdict?: string }>(`/problems/${encodeURIComponent(problemId)}/integrity/event`, { method: "POST", body: JSON.stringify({ events }) }),
  integrityRun: (problemId: string, body: { source: string; summary: string; language: string }) => request<IntegrityRun>(`/problems/${encodeURIComponent(problemId)}/integrity/run`, { method: "POST", body: JSON.stringify(body) }),
  integritySessions: (problemId?: string) => request<IntegrityAdminSession[]>(`/admin/integrity/sessions${problemId ? `?problem_id=${encodeURIComponent(problemId)}` : ""}`),
  reviewIntegritySession: (id: number, verdict: "Approved" | "Dismissed" | "Blocked" | "Open") => request<{ ok: boolean; verdict: string }>(`/admin/integrity/sessions/${id}`, { method: "PUT", body: JSON.stringify({ verdict }) }),
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  passkeyLoginOptions: (username: string) => request<any>("/auth/passkey/options", { method: "POST", body: JSON.stringify({ username }) }),
  passkeyLogin: (ceremony: string, response: any) => request<{ token: string; user: User }>("/auth/passkey/verify", { method: "POST", body: JSON.stringify({ ceremony, response }) }),
  register: (username: string, password: string, email = "", code = "") =>
    request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, email, code }),
    }),
  me: () => request<User>("/me"),
  customize: () => request<{ custom_css: string; custom_script: string; custom_html: string; custom_head: string }>("/me/customize"),
  updateCustomize: (body: { custom_css: string; custom_script: string; custom_html: string; custom_head: string }) => request<{ custom_css: string; custom_script: string; custom_html: string; custom_head: string }>("/me/customize", { method: "PUT", body: JSON.stringify(body) }),
  updateProfile: (body: { username: string; avatar: string; bio: string }) => request<User>("/me/profile", { method: "PUT", body: JSON.stringify(body) }),
  uploadAvatar: (file: File) => { const form = new FormData(); form.append("avatar", file); return upload<User>("/me/avatar", form); },
  userProfile: (id: number) => request<PublicProfile>(`/users/${id}`),
  userPresence: (id: number) => request<{ online: boolean }>(`/users/${id}/presence`),
  files: () => request<UserFile[]>("/files"),
  uploadFile: (file: File) => { const form = new FormData(); form.append("file", file); return upload<UserFile>("/files", form); },
  deleteFile: (id: number) => request<void>(`/files/${id}`, { method: "DELETE" }),
  downloadFile: async (id: number) => {
    const res = await fetch(`/api/files/${id}/download`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
    if (!res.ok) { const data = await parseResponse(res); throw new Error(data.error || "下载失败"); }
    return res.blob();
  },
  updatePassword: (body: { currentPassword: string; newPassword: string }) => request<{ ok: boolean }>("/me/password", { method: "PUT", body: JSON.stringify(body) }),
  passkeys: () => request<any[]>("/me/passkeys"),
  passkeyRegistrationOptions: () => request<any>("/me/passkeys/options", { method: "POST" }),
  registerPasskey: (ceremony: string, response: any, name: string) => request<any>("/me/passkeys", { method: "POST", body: JSON.stringify({ ceremony, response, name }) }),
  renamePasskey: (id: string, name: string) => request<any>(`/me/passkeys/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deletePasskey: (id: string) => request<void>(`/me/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  ranking: () => request<any[]>("/ranking"),
  hitokoto: () => request<{ text: string; from: string; url: string }>("/hitokoto"),
  about: () => request<{ content: string; version: string; name: string }>("/about"),
  license: () => request<{ content: string; name: string }>("/license"),
  messages: () => request<any[]>("/messages"),
  sendMessage: (body: { recipientId: number; content: string }) => request<any>("/messages", { method: "POST", body: JSON.stringify(body) }),
  readMessage: (id: number) => request<any>(`/messages/${id}/read`, { method: "PUT" }),
  readConversation: (uid: number) => request<any>(`/messages/conversation/${uid}/read`, { method: "PUT" }),
  callConfig: () => request<{ iceServers: RTCIceServer[] }>("/calls/config"),
  callSignals: (after = 0) => request<CallSignal[]>(`/calls/signals?after=${after}`),
  sendCallSignal: (body: { recipientId: number; callId: string; type: CallSignalType; payload?: any }) =>
    request<{ id: number }>("/calls/signals", { method: "POST", body: JSON.stringify(body) }),
  blog: () => request<any[]>("/blog"),
  blogPost: (id: number) => request<any>(`/blog/${id}`),
  createBlog: (body: { title: string; content: string }) => request<any>("/blog", { method: "POST", body: JSON.stringify(body) }),
  updateBlog: (id: number, body: { title: string; content: string }) => request<any>(`/blog/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteBlog: (id: number) => request<any>(`/blog/${id}`, { method: "DELETE" }),
  health: () => request<SystemHealth>("/health"),
  verifyAdmin: (password: string) =>
    request<{ token: string; expiresAt: number }>("/admin/verify", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  adminPasskeyOptions: () => request<any>("/admin/verify/passkey/options", { method: "POST" }),
  verifyAdminPasskey: (ceremony: string, response: any) => request<{ token: string; expiresAt: number }>("/admin/verify/passkey", { method: "POST", body: JSON.stringify({ ceremony, response }) }),
  adminVerification: () => request<{ valid: boolean }>("/admin/verification"),
  adminUsers: () =>
    request<Array<User & { created_at: string }>>("/admin/users"),
  switchUser: (uid: number) =>
    request<{ token: string; user: User }>("/admin/switch-user", {
      method: "POST",
      body: JSON.stringify({ uid }),
    }),
  contestUsers: () => request<Array<Pick<User, "id" | "username">>>("/admin/contest-users"),
  adminTags: () => request<any[]>("/admin/tags"),
  tagUsers: () => request<any[]>("/admin/tag-users"),
  createTag: (body: { label: string; color: string; scope: "global" | "personal" }) => request<any>("/admin/tags", { method: "POST", body: JSON.stringify(body) }),
  deleteTag: (id: number) => request<void>(`/admin/tags/${id}`, { method: "DELETE" }),
  updateUserTags: (id: number, tagIds: number[]) => request<any>(`/admin/users/${id}/tags`, { method: "PUT", body: JSON.stringify({ tagIds }) }),
  certifications: () => request<any[]>("/certifications"),
  applyCertification: (body: any) => request<any>("/certifications", { method: "POST", body: JSON.stringify(body) }),
  adminCertifications: () => request<any[]>("/admin/certifications"),
  reviewCertification: (id: number, status: string) => request<any>(`/admin/certifications/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
  updateUserRole: (id: number, role: string) =>
    request<{ id: number; role: string }>(`/admin/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  importUsers: (rows: Array<{ username: string; password: string }>) =>
    request<{
      created: string[];
      failed: Array<{ username: string; error: string }>;
    }>("/admin/users/import", {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  maintenance: (action: string) =>
    request<{ ok: boolean; affected: number }>(`/admin/maintenance/${action}`, {
      method: "POST",
    }),
  domains: () => request<any[]>("/domains"),
  domain: (id: number) => request<any>(`/domains/${id}`),
  createDomain: (body: any) =>
    request<any>("/domains", { method: "POST", body: JSON.stringify(body) }),
  updateDomain: (id: number, body: any) =>
    request<any>(`/domains/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteDomain: (id: number) =>
    request<{ ok: boolean; removed: { problems: number } }>(`/domains/${id}`, {
      method: "DELETE",
    }),
  applyDomain: (id: number, body: any) =>
    request<any>(`/domains/${id}/apply`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  decideDomainApplication: (domainId: number, id: number, status: string) =>
    request<any>(`/domains/${domainId}/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  myPermissions: () => request<MyPermissions>("/my-permissions"),
  domainPermissions: (domainId: number) => request<DomainPermissionMatrix>(`/domains/${domainId}/permissions`),
  updateDomainPermissions: (domainId: number, body: { guest?: Record<string, boolean>; member?: Record<string, boolean>; root?: Record<string, boolean> }) => request<DomainPermissionMatrix>(`/domains/${domainId}/permissions`, { method: "PUT", body: JSON.stringify(body) }),
  createDomainRole: (domainId: number, body: { name: string; permissions: Record<string, boolean> }) => request<DomainPermissionMatrix>(`/domains/${domainId}/roles`, { method: "POST", body: JSON.stringify(body) }),
  updateDomainRole: (domainId: number, roleId: number, body: { name?: string; permissions?: Record<string, boolean> }) => request<DomainPermissionMatrix>(`/domains/${domainId}/roles/${roleId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteDomainRole: (domainId: number, roleId: number) => request<DomainPermissionMatrix>(`/domains/${domainId}/roles/${roleId}`, { method: "DELETE" }),
  domainMemberPermissions: (domainId: number) => request<Array<{ user_id: number; username: string; role: string; overrides: Record<string, boolean> }>>(`/domains/${domainId}/member-permissions`),
  updateDomainMemberPermissions: (domainId: number, userId: number, permissions: Record<string, boolean>) => request<{ ok: boolean; overrides: Record<string, boolean> }>(`/domains/${domainId}/member-permissions/${userId}`, { method: "PUT", body: JSON.stringify({ permissions }) }),
  updateDomainMember: (domainId: number, userId: number, role: string) =>
    request<any>(`/domains/${domainId}/members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  countdown: () => request<CountdownConfig[]>("/settings/countdown"),
  updateCountdown: (body: CountdownConfig) =>
    request<CountdownConfig>(body.id ? `/admin/settings/countdown/${body.id}` : "/admin/settings/countdown", {
      method: body.id ? "PUT" : "POST",
      body: JSON.stringify(body),
    }),
  deleteCountdown: (id: number) => request<void>(`/admin/settings/countdown/${id}`, { method: "DELETE" }),
  site: () => request<SiteConfig>("/settings/site"),
  updateSite: (body: SiteConfig) =>
    request<SiteConfig>("/admin/settings/site", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  advancedSettings: () => request<any>("/admin/settings/advanced"),
  licenseSettings: () => request<{ serverUrl: string; keyConfigured: boolean; keyMasked: string; tier: "community" | "professional" }>("/admin/settings/license"),
  updateLicenseSettings: (body: { serverUrl: string; key?: string; clearKey?: boolean }) => request<any>("/admin/settings/license", { method: "PUT", body: JSON.stringify(body) }),
  auth0Settings: () => request<Auth0Config>("/admin/settings/auth0"),
  updateAuth0Settings: (body: Pick<Auth0Config, "enabled" | "domain" | "clientId" | "clientSecret">) =>
    request<Auth0Config>("/admin/settings/auth0", { method: "PUT", body: JSON.stringify(body) }),
  updateAdvancedSettings: (body: any) =>
    request<any>("/admin/settings/advanced", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  aiSettings: () => request<AiConfig>("/admin/settings/ai"),
  aiConfig: () => request<AiPublicConfig>("/ai/config"),
  updateAiSettings: (body: Partial<AiConfig> & { apiKey?: string }) =>
    request<AiConfig>("/admin/settings/ai", { method: "PUT", body: JSON.stringify(body) }),
  aiChat: (messages: Array<{ role: "user" | "assistant"; content: string }>) =>
    request<{ message: { role: "assistant"; content: string }; model?: string }>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
  aiConversations: () => request<{ conversations: AiConversation[] }>("/ai/conversations"),
  aiConversation: (id: number) => request<{ conversation: AiConversationDetail }>(`/ai/conversations/${id}`),
  createAiConversation: (title = "新对话") => request<{ conversation: AiConversation }>("/ai/conversations", { method: "POST", body: JSON.stringify({ title }) }),
  deleteAiConversation: (id: number) => request<void>(`/ai/conversations/${id}`, { method: "DELETE" }),
  addAiConversationMessage: (id: number, message: { role: "user" | "assistant"; content: string }) => request<any>(`/ai/conversations/${id}/messages`, { method: "POST", body: JSON.stringify(message) }),
  updateSystem: () =>
    request<{ ok: boolean; origin: string; version?: string; logs: string[]; restarting?: boolean }>(
      "/admin/system/update",
      { method: "POST" },
    ),
  uploadSystemUpdate: (file: File) => { const form = new FormData(); form.append("package", file); return upload<{ ok: boolean; version?: string; logs: string[]; restarting?: boolean }>("/admin/system/update/upload", form); },
  adminProblem: (id: string) => request<any>("/admin/problems/" + id),
  createProblem: (body: any) =>
    request<Problem>("/admin/problems", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateProblem: (id: string, body: any) =>
    request<Problem>("/admin/problems/" + id, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  updateProblemTestcases: (id: string, body: { testcases: string[][]; spj_enabled: number; spj_source: string }) =>
    request<{ id: string; testcases: string[][]; spj_enabled: number; spj_source: string }>(`/admin/problems/${encodeURIComponent(id)}/testcases`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  importProblemTestcases: (id: string, file: File) => { const form = new FormData(); form.append("package", file); return upload<{ names: string[]; testcases: string[][] }>(`/admin/problems/${encodeURIComponent(id)}/testcases/import`, form); },
  deleteProblem: (id: string) =>
    request<void>("/admin/problems/" + id, { method: "DELETE" }),
  deleteProblems: (ids: string[]) => request<{ deleted: number }>("/admin/problems/batch-delete", { method: "POST", body: JSON.stringify({ ids }) }),
  appendAiPolicy: () => request<{ updated: number; policy: string }>("/admin/problems/append-ai-policy", { method: "POST" }),
  importProblems: (file: File) => { const form = new FormData(); form.append("package", file); return upload<{ inserted: string[]; skipped: string[]; failed: Array<{ directory: string; error: string }>; remoteOnly: boolean }>("/admin/problems/import", form); },
  createContest: (body: any) =>
    request<Contest>("/admin/contests", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateContest: (id: number, body: any) =>
    request<Contest>("/admin/contests/" + id, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteContest: (id: number) =>
    request<void>("/admin/contests/" + id, { method: "DELETE" }),
  discussions: () => request<Discussion[]>("/discussions"),
  discussion: (id: number) => request<Discussion>("/discussions/" + id),
  createDiscussion: (body: any) =>
    request<{ id: number }>("/discussions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  reply: (id: number, content: string) =>
    request<{ id: number }>(`/discussions/${id}/replies`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  deleteDiscussion: (id: number) =>
    request<void>("/discussions/" + id, { method: "DELETE" }),
  userSearch: (q: string) => request<Array<FriendUser & { relation: FriendRelation; request_id: number | null }>>("/users/search?q=" + encodeURIComponent(q)),
  friends: () => request<FriendGroups>("/friends"),
  sendFriendRequest: (userId: number) => request<{ id: number; status: string }>("/friends/requests", { method: "POST", body: JSON.stringify({ userId }) }),
  respondFriendRequest: (id: number, status: "accepted" | "rejected") =>
    request<{ ok: boolean; status: string }>(`/friends/requests/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
  removeFriend: (userId: number) => request<{ ok: boolean }>(`/friends/${userId}`, { method: "DELETE" }),
  moments: () => request<Moment[]>("/moments"),
  createMoment: (body: { content: string; images: string[] }) => request<{ id: number }>("/moments", { method: "POST", body: JSON.stringify(body) }),
  deleteMoment: (id: number) => request<void>(`/moments/${id}`, { method: "DELETE" }),
  toggleMomentLike: (id: number) => request<{ liked: boolean; likes: Array<{ user_id: number; username: string }> }>(`/moments/${id}/like`, { method: "PUT" }),
  addMomentComment: (id: number, content: string) => request<MomentComment>(`/moments/${id}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
  deleteMomentComment: (id: number) => request<void>(`/moments/comments/${id}`, { method: "DELETE" }),
  uploadMomentImage: (file: File) => { const form = new FormData(); form.append("image", file); return upload<{ url: string }>("/moments/images", form); },
  // --- Code reports (dangerous code auto-detection) ---
  codeReports: (status = "pending", limit = 50, offset = 0) =>
    request<{ reports: any[]; total: number }>(
      `/admin/code-reports?status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`
    ),
  updateCodeReport: (id: number, status: string, note = "") =>
    request<{ ok: boolean }>(`/admin/code-reports/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status, note }),
    }),
  deleteCodeReport: (id: number) =>
    request<void>(`/admin/code-reports/${id}`, { method: "DELETE" }),
  // --- User ban management ---
  banUser: (id: number, duration_ms: number, reason: string) =>
    request<{ ok: boolean; banned_until: number; reason: string }>(`/admin/users/${id}/ban`, {
      method: "POST",
      body: JSON.stringify({ duration_ms, reason }),
    }),
  unbanUser: (id: number) =>
    request<{ ok: boolean }>(`/admin/users/${id}/unban`, {
      method: "POST",
    }),
};
