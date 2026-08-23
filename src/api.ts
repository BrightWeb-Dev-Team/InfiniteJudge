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
  hidden?: number;
  spj_enabled?: number;
  spj_source?: string;
  question_type?: "programming" | "single" | "multiple" | "judge" | "objective";
  objective_options?: string[];
  objective_answer?: string[];
  objective_items?: Array<{ type: "single" | "multiple" | "judge"; options: string[]; answer?: string[] }>;
  source_domain?: string;
};
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
export type User = { id: number; username: string; role: string; avatar?: string; rp?: number; bio?: string };
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
export type SiteConfig = { name: string; serviceUrl: string; logo: string; announcement?: string; homeAnnouncement?: string; domainAnnouncement?: string; announcementPopup?: boolean; announcementStartsAt?: string; announcementEndsAt?: string; carousel?: Array<{ image: string; title?: string; link?: string }>; pagination?: { problems?: number } };
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
const token = () => localStorage.getItem("ij-token");
const elevation = () => sessionStorage.getItem("ij-admin-verification");
const domain = () => localStorage.getItem("ij-domain-id");
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
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data as T;
}
async function upload<T>(url: string, form: FormData) {
  const res = await fetch("/api" + url, { method: "POST", body: form, headers: { ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(elevation() ? { "X-Admin-Verification": elevation()! } : {}), ...(domain() ? { "X-Domain-ID": domain()! } : {}) } });
  const data = await parseResponse(res);
  if (!res.ok) throw new Error(data.error || "上传失败");
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
  authConfig: () => request<{ emailVerification: boolean; brightwebOauth?: { enabled: boolean } }>("/auth/config"),
  sendEmailCode: (email: string) => request<{ ok: boolean }>("/auth/email-code", { method: "POST", body: JSON.stringify({ email }) }),
  problems: () => request<Problem[]>("/problems"),
  problem: (id: string) => request<Problem>("/problems/" + encodeURIComponent(id)),
  contests: () => request<Contest[]>("/contests"),
  contest: (id: number) => request<Contest>("/contests/" + id),
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
  updateAdvancedSettings: (body: any) =>
    request<any>("/admin/settings/advanced", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
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
};
