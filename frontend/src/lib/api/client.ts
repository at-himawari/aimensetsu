import type { components } from "../../generated/api";
import type { AuthState } from "../../state/auth";


type AuthMeResponseEnvelope = components["schemas"]["AuthMeResponseEnvelope"];
type ErrorResponse = components["schemas"]["ErrorResponse"];

type DemoLoginResponseEnvelope = {
  data: {
    user: {
      user_id: string;
      name: string;
      email?: string | null;
      phone_number?: string | null;
      auth_provider: "demo" | "cognito";
      roles: Array<"user" | "admin">;
    };
    token_type: "demo";
    access_token: string;
  };
  meta: {
    request_id: string;
  };
};


type ApiClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export type InterviewSession = {
  session_id: string;
  resume_id?: string | null;
  status: "active" | "completed" | "deleted";
  mode: string;
  job_role?: string | null;
  consumed_minutes?: number;
  remaining_credit_minutes_after?: number | null;
  used_fallback: boolean;
  started_at: string;
  ended_at?: string | null;
};

export type InterviewMessage = {
  message_id: string;
  sender_type: "user" | "assistant";
  message_type?: "text" | "voice" | null;
  content: string;
  ai_mode?: "azure" | "fallback" | null;
  created_at?: string | null;
};

export type Reflection = {
  reflection_id: string;
  strengths: string[];
  improvements: string[];
  advice: string;
  ai_mode: "azure" | "fallback";
  created_at?: string | null;
};

type HistoryListResponseEnvelope = {
  data: InterviewSession[];
  meta: {
    request_id: string;
  };
};

type HistoryDetailResponseEnvelope = {
  data: {
    session: InterviewSession;
    messages: InterviewMessage[];
    reflection?: Reflection | null;
  };
  meta: {
    request_id: string;
  };
};


export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}


export function createApiClient(options: ApiClientOptions) {
  async function request<T>(path: string, authState: AuthState, init?: RequestInit): Promise<T> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const headers = new Headers(init?.headers ?? {});
    headers.set("Content-Type", "application/json");

    if (authState.mode === "demo" && authState.demoUserId) {
      headers.set("X-Demo-User", authState.demoUserId);
    }
    if (authState.mode === "jwt" && authState.accessToken) {
      headers.set("Authorization", `Bearer ${authState.accessToken}`);
    }

    const response = await fetchImpl(`${options.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let errorResponse: ErrorResponse | null = null;
      try {
        errorResponse = (await response.json()) as ErrorResponse;
      } catch {
        errorResponse = null;
      }

      throw new ApiError(
        errorResponse?.error.message ?? "API リクエストに失敗しました。",
        response.status,
        errorResponse?.error.code,
      );
    }

    return (await response.json()) as T;
  }

  return {
    demoLogin(demoUserId: string, name: string) {
      return request<DemoLoginResponseEnvelope>("/api/auth/demo-login", { mode: "anonymous", demoUserId: null, accessToken: null }, {
        method: "POST",
        body: JSON.stringify({
          demo_user_id: demoUserId,
          name,
        }),
      });
    },
    getAuthMe(authState: AuthState) {
      return request<AuthMeResponseEnvelope>("/api/auth/me", authState, { method: "GET" });
    },
    getHistory(authState: AuthState) {
      return request<HistoryListResponseEnvelope>("/api/history", authState, { method: "GET" });
    },
    getHistoryDetail(authState: AuthState, sessionId: string) {
      return request<HistoryDetailResponseEnvelope>(`/api/history/${sessionId}`, authState, { method: "GET" });
    },
  };
}
