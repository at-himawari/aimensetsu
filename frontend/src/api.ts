export type Me = {
  email: string;
  name: string;
  phoneNumber: string;
  phoneVerified: boolean;
  requiresPhoneVerification: boolean;
  quotaMinutes: number;
  blockPriceJpy: number;
  blockMinutes: number;
};

export type PracticeSession = {
  id: number;
  title: string;
  role: string;
  minutesUsed: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  documentCount: number;
};

export type Feedback = {
  summary: string;
  strengths: string[];
  improvements: string[];
  nextQuestions: string[];
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const demoHeaders = {
  "X-Demo-User": "demo@example.com",
  "X-Demo-Name": "面接 太郎",
  "X-Demo-Phone": "+810000000000",
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  Object.entries(demoHeaders).forEach(([key, value]) => headers.set(key, value));
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<Me>("/api/me/"),
  sessions: () => request<{ sessions: PracticeSession[] }>("/api/sessions/"),
  createSession: (body: { title: string; role: string }) =>
    request<{ session: PracticeSession }>("/api/sessions/", { method: "POST", body: JSON.stringify(body) }),
  deleteSession: (id: number) => request<{ ok: boolean }>(`/api/sessions/${id}/`, { method: "DELETE" }),
  uploadDocument: (sessionId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ id: number; filename: string; chars: number }>(`/api/sessions/${sessionId}/documents/`, {
      method: "POST",
      body: form,
    });
  },
  sendMessage: (sessionId: number, content: string, minutes = 1) =>
    request<{ message: { id: number; role: string; content: string }; quotaMinutes: number }>(
      `/api/sessions/${sessionId}/messages/`,
      { method: "POST", body: JSON.stringify({ content, minutes }) },
    ),
  feedback: (sessionId: number) => request<Feedback>(`/api/sessions/${sessionId}/feedback/`, { method: "POST" }),
  checkout: () => request<{ url: string; mode: string }>("/api/billing/checkout/", { method: "POST" }),
  startPhoneVerification: (phoneNumber: string) =>
    request<{ phoneNumber: string; expiresInSeconds: number; delivery: string; verificationCode?: string }>("/api/phone/start/", {
      method: "POST",
      body: JSON.stringify({ phoneNumber }),
    }),
  verifyPhone: (phoneNumber: string, code: string) =>
    request<{ phoneNumber: string; phoneVerified: boolean }>("/api/phone/verify/", {
      method: "POST",
      body: JSON.stringify({ phoneNumber, code }),
    }),
};
