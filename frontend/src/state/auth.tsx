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


function readInitialState(): AuthState {
  if (typeof window === "undefined") {
    return defaultState;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState;
  }

  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return defaultState;
  }
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(() => readInitialState());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(authState));
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
