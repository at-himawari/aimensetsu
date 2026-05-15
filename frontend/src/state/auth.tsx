import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";


export type AuthState = {
  mode: "anonymous" | "demo" | "jwt";
  demoUserId: string | null;
  accessToken: string | null;
};

type AuthContextValue = {
  authState: AuthState;
  loginDemo: (demoUserId: string, _name: string) => void;
  setJwt: (token: string) => void;
  logout: () => void;
};

const STORAGE_KEY = "aimensetsu_auth_state";

const defaultState: AuthState = {
  mode: "anonymous",
  demoUserId: null,
  accessToken: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);


function readJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=");
    return JSON.parse(window.atob(paddedPayload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}


function isUsableAccessToken(token: string) {
  const payload = readJwtPayload(token);
  if (!payload) {
    return false;
  }

  const expiresAt = typeof payload.exp === "number" ? payload.exp : null;
  if (expiresAt !== null && expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }
  return payload.token_use === "access";
}


function normalizeAuthState(value: unknown): AuthState {
  if (!value || typeof value !== "object") {
    return defaultState;
  }

  const candidate = value as Partial<AuthState>;
  if (candidate.mode === "demo" && typeof candidate.demoUserId === "string" && candidate.demoUserId.trim()) {
    return {
      mode: "demo",
      demoUserId: candidate.demoUserId,
      accessToken: null,
    };
  }
  if (
    candidate.mode === "jwt" &&
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.trim() &&
    isUsableAccessToken(candidate.accessToken)
  ) {
    return {
      mode: "jwt",
      demoUserId: null,
      accessToken: candidate.accessToken,
    };
  }
  return defaultState;
}


function readInitialState(): AuthState {
  if (typeof window === "undefined") {
    return defaultState;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState;
  }

  try {
    return normalizeAuthState(JSON.parse(raw));
  } catch {
    return defaultState;
  }
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(() => readInitialState());

  useEffect(() => {
    const normalizedState = normalizeAuthState(authState);
    if (normalizedState.mode !== authState.mode || normalizedState.demoUserId !== authState.demoUserId || normalizedState.accessToken !== authState.accessToken) {
      setAuthState(normalizedState);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));
  }, [authState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authState,
      loginDemo(demoUserId: string) {
        setAuthState({
          mode: "demo",
          demoUserId,
          accessToken: null,
        });
      },
      setJwt(token: string) {
        setAuthState({
          mode: "jwt",
          demoUserId: null,
          accessToken: token,
        });
      },
      logout() {
        setAuthState(defaultState);
      },
    }),
    [authState],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}


export function resetStoredAuthState() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
