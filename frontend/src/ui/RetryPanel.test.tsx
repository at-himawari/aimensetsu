import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RetryPanel } from "./RetryPanel";


describe("RetryPanel", () => {
  it("calls retry when button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<RetryPanel message="失敗しました" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "もう一度試す" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
