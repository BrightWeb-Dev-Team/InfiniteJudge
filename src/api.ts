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
export type UserFile = { id: number; original_name: string; mime_type: string; size: number; created_at: string };
export type PublicProfile = User & { created_at: string; submissions: number; solved: number; blog: any[] };
export type CountdownConfig = { id?: number; title: string; target: string };
export type SiteConfig = { name: string; serviceUrl: string; logo: string; announcement?: string };
export type SystemHealth = {
  ok: boolean;
  judge: any;
  plugins: any[];
  database: string;
  queue: { pending: number; total: number };
  uptime: number;
};
export type Contest = {
  id: number;
  title: string;
  type: string;
  starts_at: string;
  duration: number;
  description: string;
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
async function request<T>(url: string, init: RequestInit = {}) {
  const res = await fetch("/api" + url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(elevation() ? { "X-Admin-Verification": elevation()! } : {}),
      ...init.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data as T;
}
async function upload<T>(url: string, form: FormData) {
  const res = await fetch("/api" + url, { method: "POST", body: form, headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "上传失败");
  return data as T;
}
export const api = {
  setupStatus: () => request<{ installed: boolean }>("/setup/status"),
  version: () => request<{ version: string; source: "remote" | "local" }>("/version"),
  setup: (body: any) => request<{ token: string; user: User }>("/setup", { method: "POST", body: JSON.stringify(body) }),
  authConfig: () => request<{ emailVerification: boolean }>("/auth/config"),
  sendEmailCode: (email: string) => request<{ ok: boolean }>("/auth/email-code", { method: "POST", body: JSON.stringify({ email }) }),
  problems: () => request<Problem[]>("/problems"),
  problem: (id: string) => request<Problem>("/problems/" + id),
  contests: () => request<Contest[]>("/contests"),
  contest: (id: number) => request<Contest>("/contests/" + id),
  learning: (kind: "training" | "homework") => request<any[]>(`/learning/${kind}`),
  learningDetail: (kind: "training" | "homework", id: number) => request<any>(`/learning/${kind}/${id}`),
  createLearning: (kind: "training" | "homework", body: any) => request<any>(`/admin/learning/${kind}`, { method: "POST", body: JSON.stringify(body) }),
  updateLearning: (kind: "training" | "homework", id: number, body: any) => request<any>(`/admin/learning/${kind}/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteLearning: (kind: "training" | "homework", id: number) => request<void>(`/admin/learning/${kind}/${id}`, { method: "DELETE" }),
  submissions: () => request<Submission[]>("/submissions"),
  submission: (id: number) => request<any>("/submissions/" + id),
  submit: (body: { problem_id: string; language: string; source: string }) =>
    request<{ id: number; status: string }>("/submissions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  register: (username: string, password: string, email = "", code = "") =>
    request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, email, code }),
    }),
  me: () => request<User>("/me"),
  updateProfile: (body: { username: string; avatar: string; bio: string }) => request<User>("/me/profile", { method: "PUT", body: JSON.stringify(body) }),
  uploadAvatar: (file: File) => { const form = new FormData(); form.append("avatar", file); return upload<User>("/me/avatar", form); },
  userProfile: (id: number) => request<PublicProfile>(`/users/${id}`),
  files: () => request<UserFile[]>("/files"),
  uploadFile: (file: File) => { const form = new FormData(); form.append("file", file); return upload<UserFile>("/files", form); },
  deleteFile: (id: number) => request<void>(`/files/${id}`, { method: "DELETE" }),
  downloadFile: async (id: number) => {
    const res = await fetch(`/api/files/${id}/download`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
    if (!res.ok) { const data = await res.json(); throw new Error(data.error || "下载失败"); }
    return res.blob();
  },
  updatePassword: (body: { currentPassword: string; newPassword: string }) => request<{ ok: boolean }>("/me/password", { method: "PUT", body: JSON.stringify(body) }),
  ranking: () => request<any[]>("/ranking"),
  hitokoto: () => request<{ text: string; from: string }>("/hitokoto"),
  messages: () => request<any[]>("/messages"),
  sendMessage: (body: { recipient: string; content: string }) => request<any>("/messages", { method: "POST", body: JSON.stringify(body) }),
  readMessage: (id: number) => request<any>(`/messages/${id}/read`, { method: "PUT" }),
  blog: () => request<any[]>("/blog"),
  createBlog: (body: { title: string; content: string }) => request<any>("/blog", { method: "POST", body: JSON.stringify(body) }),
  health: () => request<SystemHealth>("/health"),
  verifyAdmin: (password: string) =>
    request<{ token: string; expiresAt: number }>("/admin/verify", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  adminVerification: () => request<{ valid: boolean }>("/admin/verification"),
  adminUsers: () =>
    request<Array<User & { created_at: string }>>("/admin/users"),
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
    request<{ ok: boolean; origin: string; version?: string; logs: string[] }>(
      "/admin/system/update",
      { method: "POST" },
    ),
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
  deleteProblem: (id: string) =>
    request<void>("/admin/problems/" + id, { method: "DELETE" }),
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
