import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginScreen } from "./LoginScreen";


function renderLoginScreen(overrides: Partial<ComponentProps<typeof LoginScreen>> = {}) {
  return render(
    <LoginScreen
      onDemoLogin={vi.fn()}
      onPasswordLogin={vi.fn(async () => undefined)}
      onSignUp={vi.fn(async () => undefined)}
      onConfirmSignUp={vi.fn(async () => undefined)}
      onResendConfirmationCode={vi.fn(async () => undefined)}
      onForgotPassword={vi.fn(async () => undefined)}
      onConfirmForgotPassword={vi.fn(async () => undefined)}
      authMode="cognito"
      isCognitoConfigured
      {...overrides}
    />,
  );
}


describe("LoginScreen", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("locks account tabs after starting email confirmation", async () => {
    const user = userEvent.setup();
    const onSignUp = vi.fn(async () => ({
      DeliveryMedium: "EMAIL",
      Destination: "u***@example.com",
    }));
    renderLoginScreen({ onSignUp });

    await user.click(screen.getByRole("tab", { name: "新規登録" }));
    await user.type(screen.getByLabelText("お名前"), "山田太郎");
    await user.type(screen.getByLabelText("メールアドレス"), "user@example.com");
    await user.type(screen.getByLabelText("パスワード"), "Password1!");
    await user.click(screen.getByRole("button", { name: "新規登録" }));

    expect(await screen.findByRole("heading", { name: "メール確認" })).toBeInTheDocument();
    expect(screen.getByText("確認コードをメール（u***@example.com）に送信しました。")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ログイン" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "新規登録" })).toBeDisabled();
    expect(window.localStorage.getItem("aimensetsu_pending_confirmation_email")).toBe("user@example.com");
  });

  it("restores the email confirmation screen after leaving before confirmation", () => {
    window.localStorage.setItem("aimensetsu_pending_confirmation_email", "user@example.com");

    renderLoginScreen();

    expect(screen.getByRole("heading", { name: "メール確認" })).toBeInTheDocument();
    expect(screen.getByLabelText("メール確認コード")).toBeInTheDocument();
  });

  it("moves back to email confirmation when login is attempted before email verification", async () => {
    const user = userEvent.setup();
    const view = renderLoginScreen();

    await user.type(screen.getByLabelText("メールアドレス"), "user@example.com");
    view.rerender(
      <LoginScreen
        onDemoLogin={vi.fn()}
        onPasswordLogin={vi.fn(async () => undefined)}
        onSignUp={vi.fn(async () => undefined)}
        onConfirmSignUp={vi.fn(async () => undefined)}
        onResendConfirmationCode={vi.fn(async () => undefined)}
        onForgotPassword={vi.fn(async () => undefined)}
        onConfirmForgotPassword={vi.fn(async () => undefined)}
        authMode="cognito"
        isCognitoConfigured
        errorMessage="メール確認が完了していません。メールの確認コードを入力してください。"
      />,
    );

    expect(await screen.findByRole("heading", { name: "メール確認" })).toBeInTheDocument();
    expect(screen.getByLabelText("メール確認コード")).toBeInTheDocument();
  });

  it("announces an incorrect password message on the login form", () => {
    renderLoginScreen({
      errorMessage: "メールアドレスまたはパスワードが間違っています。",
    });

    expect(screen.getByRole("alert")).toHaveTextContent("メールアドレスまたはパスワードが間違っています。");
  });

  it("shows a maintenance notice on the login form", () => {
    renderLoginScreen({
      maintenanceMessage: "午前1時から午前6時までは、システムメンテナンスのため利用できません。",
    });

    expect(screen.getByRole("status")).toHaveTextContent("システムメンテナンス");
  });

  it("moves migrated users to password reset when Cognito requires it", async () => {
    const user = userEvent.setup();
    const view = renderLoginScreen();

    await user.type(screen.getByLabelText("メールアドレス"), "migrated@example.com");
    view.rerender(
      <LoginScreen
        onDemoLogin={vi.fn()}
        onPasswordLogin={vi.fn(async () => undefined)}
        onSignUp={vi.fn(async () => undefined)}
        onConfirmSignUp={vi.fn(async () => undefined)}
        onResendConfirmationCode={vi.fn(async () => undefined)}
        onForgotPassword={vi.fn(async () => undefined)}
        onConfirmForgotPassword={vi.fn(async () => undefined)}
        authMode="cognito"
        isCognitoConfigured
        errorMessage="パスワード再設定が必要です。確認コードを受け取り、新しいパスワードを設定してください。"
      />,
    );

    expect(await screen.findByRole("heading", { name: "パスワード再設定" })).toBeInTheDocument();
    expect(screen.getByLabelText("メールアドレス")).toHaveValue("migrated@example.com");
    expect(screen.getByRole("button", { name: "確認コードを送信" })).toBeInTheDocument();
  });

  it("completes the password reset code flow", async () => {
    const user = userEvent.setup();
    const onForgotPassword = vi.fn(async () => ({
      DeliveryMedium: "EMAIL",
      Destination: "m***@example.com",
    }));
    const onConfirmForgotPassword = vi.fn(async () => undefined);
    renderLoginScreen({ onForgotPassword, onConfirmForgotPassword });

    await user.click(screen.getByRole("button", { name: "パスワードを再設定する" }));
    await user.type(screen.getByLabelText("メールアドレス"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "確認コードを送信" }));

    expect(onForgotPassword).toHaveBeenCalledWith({ email: "user@example.com" });
    expect(await screen.findByRole("heading", { name: "パスワード再設定" })).toBeInTheDocument();
    expect(screen.getByLabelText("確認コード")).toBeInTheDocument();
    expect(screen.getByText("確認コードをメール（m***@example.com）に送信しました。")).toBeInTheDocument();

    await user.type(screen.getByLabelText("確認コード"), "123456");
    await user.type(screen.getByLabelText("新しいパスワード"), "NewPassword1!");
    await user.type(screen.getByLabelText("新しい電話番号"), "090-1234-5678");
    await user.click(screen.getByRole("button", { name: "パスワードを再設定" }));

    expect(onConfirmForgotPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      code: "123456",
      newPassword: "NewPassword1!",
      phoneNumber: "090-1234-5678",
    });
  });
});
