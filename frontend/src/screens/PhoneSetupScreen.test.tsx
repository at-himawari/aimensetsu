import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PhoneSetupScreen } from "./PhoneSetupScreen";

describe("PhoneSetupScreen", () => {
  it("sends an SMS code and verifies it before use starts", async () => {
    const user = userEvent.setup();
    const onSendCode = vi.fn(async () => undefined);
    const onVerifyCode = vi.fn(async () => undefined);
    render(
      <PhoneSetupScreen
        onSendCode={onSendCode}
        onVerifyCode={onVerifyCode}
        onLogout={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("電話番号"), "090-1234-5678");
    await user.click(screen.getByRole("button", { name: "確認コードを送信" }));

    expect(onSendCode).toHaveBeenCalledWith("090-1234-5678");
    expect(await screen.findByText("SMSで確認コードを送信しました。")).toBeInTheDocument();

    await user.type(screen.getByLabelText("SMS確認コード"), "123456");
    await user.click(screen.getByRole("button", { name: "利用を開始する" }));

    expect(onVerifyCode).toHaveBeenCalledWith("123456");
  });

  it("can start from the SMS verification step after password reset", async () => {
    const user = userEvent.setup();
    const onVerifyCode = vi.fn(async () => undefined);
    render(
      <PhoneSetupScreen
        onSendCode={vi.fn(async () => undefined)}
        onVerifyCode={onVerifyCode}
        onLogout={vi.fn()}
        initialCodeSent
        initialMessage="SMSで確認コードを送信しました。"
      />,
    );

    expect(screen.getByText("SMSで確認コードを送信しました。")).toBeInTheDocument();
    expect(screen.getByLabelText("SMS確認コード")).toBeInTheDocument();

    await user.type(screen.getByLabelText("SMS確認コード"), "654321");
    await user.click(screen.getByRole("button", { name: "利用を開始する" }));

    expect(onVerifyCode).toHaveBeenCalledWith("654321");
  });
});
