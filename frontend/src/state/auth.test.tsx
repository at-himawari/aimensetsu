import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { AuthProvider, resetStoredAuthState, useAuth } from "./auth";


function makeJwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    window.btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "none" })}.${encode(payload)}.signature`;
}


function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}


describe("auth state", () => {
  it("stores demo login state and can logout", () => {
    resetStoredAuthState();
    const { result } = renderHook(() => useAuth(), { wrapper });

    act(() => {
      result.current.loginDemo("demo_test", "Demo User");
    });
    expect(result.current.authState.mode).toBe("demo");
    expect(result.current.authState.demoUserId).toBe("demo_test");

    act(() => {
      result.current.logout();
    });
    expect(result.current.authState.mode).toBe("anonymous");
  });

  it("stores jwt mode", () => {
    resetStoredAuthState();
    const { result } = renderHook(() => useAuth(), { wrapper });
    const token = makeJwt({ token_use: "access", exp: Math.floor(Date.now() / 1000) + 3600 });

    act(() => {
      result.current.setJwt(token);
    });
    expect(result.current.authState.mode).toBe("jwt");
    expect(result.current.authState.accessToken).toBe(token);
  });

  it("ignores persisted jwt state without a token", () => {
    window.localStorage.setItem(
      "aimensetsu_auth_state",
      JSON.stringify({ mode: "jwt", demoUserId: null, accessToken: null }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.authState.mode).toBe("anonymous");
  });

  it("ignores persisted id tokens because API calls require an access token", () => {
    window.localStorage.setItem(
      "aimensetsu_auth_state",
      JSON.stringify({
        mode: "jwt",
        demoUserId: null,
        accessToken: makeJwt({ token_use: "id", exp: Math.floor(Date.now() / 1000) + 3600 }),
      }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.authState.mode).toBe("anonymous");
  });

  it("restores a persisted access token", () => {
    const token = makeJwt({ token_use: "access", exp: Math.floor(Date.now() / 1000) + 3600 });
    window.localStorage.setItem(
      "aimensetsu_auth_state",
      JSON.stringify({
        mode: "jwt",
        demoUserId: null,
        accessToken: token,
      }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.authState.mode).toBe("jwt");
    expect(result.current.authState.accessToken).toBe(token);
  });
});
