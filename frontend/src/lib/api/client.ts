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

const RESUME_UPLOAD_TIMEOUT_MS = 60000;

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
  ai_mode?: "openai" | "azure" | "fallback" | null;
  created_at?: string | null;
};

export type Reflection = {
  reflection_id: string;
  strengths: string[];
  improvements: string[];
  advice: string;
  ai_mode: "openai" | "azure" | "fallback";
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

export type ResumeFile = {
  resume_id: string;
  title?: string | null;
  file_name: string;
  file_path: string;
  content_type: string;
  file_size: number;
  has_extracted_text: boolean;
  extracted_text_preview?: string;
  uploaded_at: string;
  deleted_at?: string | null;
};

type ResumeListResponseEnvelope = {
  data: ResumeFile[];
  meta: {
    request_id: string;
  };
};

type ResumeResponseEnvelope = {
  data: ResumeFile;
  meta: {
    request_id: string;
  };
};

type DeleteResponseEnvelope = {
  data: {
    message: string;
  };
  meta: {
    request_id: string;
  };
};

type CreditBalanceResponseEnvelope = {
  data: {
    available_minutes: number;
  };
  meta: {
    request_id: string;
  };
};

type CheckoutSessionResponseEnvelope = {
  data: {
    payment_session_id: string;
    checkout_session_id: string;
    checkout_url: string;
    expires_at?: string | null;
  };
  meta: {
    request_id: string;
  };
};

type CheckoutSessionConfirmResponseEnvelope = {
  data: {
    payment_session_id: string;
    checkout_session_id: string;
    status: string;
    available_minutes: number;
  };
  meta: {
    request_id: string;
  };
};

type PhoneNumberPrepareResponseEnvelope = {
  data: {
    phone_number: string;
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
    const hasFormDataBody = typeof FormData !== "undefined" && init?.body instanceof FormData;
    if (!hasFormDataBody && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

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
    preparePhoneNumberUpdate(authState: AuthState, phoneNumber: string) {
      return request<PhoneNumberPrepareResponseEnvelope>("/api/users/phone-number/prepare", authState, {
        method: "POST",
        body: JSON.stringify({
          phone_number: phoneNumber,
        }),
      });
    },
    getCreditBalance(authState: AuthState) {
      return request<CreditBalanceResponseEnvelope>("/api/credits/balance", authState, { method: "GET" });
    },
    getHistory(authState: AuthState) {
      return request<HistoryListResponseEnvelope>("/api/history", authState, { method: "GET" });
    },
    getHistoryDetail(authState: AuthState, sessionId: string) {
      return request<HistoryDetailResponseEnvelope>(`/api/history/${sessionId}`, authState, { method: "GET" });
    },
    deleteHistory(authState: AuthState, sessionId: string) {
      return request<DeleteResponseEnvelope>(`/api/history/${sessionId}`, authState, { method: "DELETE" });
    },
    createCheckoutSession(
      authState: AuthState,
      payload: {
        plan_code: string;
        quantity: number;
        success_url: string;
        cancel_url: string;
      },
    ) {
      return request<CheckoutSessionResponseEnvelope>("/api/billing/checkout-sessions", authState, {
        method: "POST",
        headers: {
          "Idempotency-Key": `checkout_${Date.now()}`,
        },
        body: JSON.stringify(payload),
      });
    },
    confirmCheckoutSession(authState: AuthState, checkoutSessionId: string) {
      return request<CheckoutSessionConfirmResponseEnvelope>("/api/billing/checkout-sessions/confirm", authState, {
        method: "POST",
        body: JSON.stringify({
          checkout_session_id: checkoutSessionId,
        }),
      });
    },
    listResumes(authState: AuthState) {
      return request<ResumeListResponseEnvelope>("/api/resumes", authState, { method: "GET" });
    },
    async uploadResume(authState: AuthState, file: File, title?: string) {
      const formData = new FormData();
      formData.append("file", file);
      if (title) {
        formData.append("title", title);
      }
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), RESUME_UPLOAD_TIMEOUT_MS);
      try {
        return await request<ResumeResponseEnvelope>("/api/resumes", authState, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    deleteResume(authState: AuthState, resumeId: string) {
      return request<DeleteResponseEnvelope>(`/api/resumes/${resumeId}/`, authState, { method: "DELETE" });
    },
  };
}
