import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { AuthProvider, resetStoredAuthState, useAuth } from "./auth";


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

    act(() => {
      result.current.setJwt("jwt-token");
    });
    expect(result.current.authState.mode).toBe("jwt");
    expect(result.current.authState.accessToken).toBe("jwt-token");
  });
});
