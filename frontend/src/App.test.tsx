import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.stubGlobal(
  "fetch",
  vi.fn((url: string) => {
    if (url.endsWith("/api/me/")) {
      return Promise.resolve(new Response(JSON.stringify({ name: "面接 太郎", email: "demo@example.com", phoneNumber: "+810000000000", phoneVerified: true, requiresPhoneVerification: false, quotaMinutes: 30, blockPriceJpy: 300, blockMinutes: 30 })));
    }
    return Promise.resolve(new Response(JSON.stringify({ sessions: [] })));
  }),
);

describe("App", () => {
  it("renders the practice workspace", async () => {
    render(<App />);
    expect(await screen.findByText("次の回答を、一緒に磨く。")).toBeInTheDocument();
    expect(screen.getByText("練習履歴")).toBeInTheDocument();
  });
});
