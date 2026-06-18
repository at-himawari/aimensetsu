import { useEffect, useState, type FormEvent } from "react";

import type { CognitoCodeDeliveryDetails } from "../lib/auth/cognito";

const PENDING_CONFIRMATION_EMAIL_KEY = "aimensetsu_pending_confirmation_email";

type LoginScreenProps = {
  onDemoLogin: () => void;
  onPasswordLogin: (payload: { email: string; password: string }) => Promise<void>;
  onSignUp: (payload: { email: string; password: string; name?: string }) => Promise<CognitoCodeDeliveryDetails | undefined>;
  onConfirmSignUp: (payload: { email: string; code: string }) => Promise<void>;
  onResendConfirmationCode: (payload: { email: string }) => Promise<CognitoCodeDeliveryDetails | undefined>;
  onForgotPassword: (payload: { email: string }) => Promise<CognitoCodeDeliveryDetails | undefined>;
  onConfirmForgotPassword: (payload: { email: string; code: string; newPassword: string; phoneNumber: string }) => Promise<void>;
  authMode?: "demo" | "cognito";
  isCognitoConfigured?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  demoLoginLabel?: string;
};

function formatCodeDeliveryMessage(details?: CognitoCodeDeliveryDetails) {
  const destination = details?.Destination;
  if (details?.DeliveryMedium === "EMAIL") {
    return destination
      ? `確認コードをメール（${destination}）に送信しました。`
      : "確認コードをメールに送信しました。";
  }
  if (details?.DeliveryMedium === "SMS") {
    return destination
      ? `確認コードをSMS（${destination}）に送信しました。`
      : "確認コードをSMSに送信しました。";
  }
  return "確認コードを送信しました。届かない場合は、メール確認の設定を確認してください。";
}


export function LoginScreen({
  onDemoLogin,
  onPasswordLogin,
  onSignUp,
  onConfirmSignUp,
  onResendConfirmationCode,
  onForgotPassword,
  onConfirmForgotPassword,
  authMode = "demo",
  isCognitoConfigured = false,
  isLoading = false,
  errorMessage = null,
  demoLoginLabel = "無料体験を始める",
}: LoginScreenProps) {
  const storedConfirmationEmail = window.localStorage.getItem(PENDING_CONFIRMATION_EMAIL_KEY) ?? "";
  const [mode, setMode] = useState<"login" | "signup" | "confirm" | "reset" | "reset-confirm">(
    storedConfirmationEmail ? "confirm" : "login",
  );
  const [email, setEmail] = useState(storedConfirmationEmail);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetPhoneNumber, setResetPhoneNumber] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const resendWaitSeconds = resendAvailableAt ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!resendAvailableAt || resendAvailableAt <= now) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [now, resendAvailableAt]);

  useEffect(() => {
    if (errorMessage?.includes("メール確認") && email) {
      window.localStorage.setItem(PENDING_CONFIRMATION_EMAIL_KEY, email);
      setMode("confirm");
    }
    if (errorMessage?.includes("パスワード再設定") && email) {
      setMode("reset");
    }
  }, [email, errorMessage]);

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalMessage(null);
    await onPasswordLogin({ email, password });
  };

  const handleSignUpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalMessage(null);
    const deliveryDetails = await onSignUp({ email, password, name });
    window.localStorage.setItem(PENDING_CONFIRMATION_EMAIL_KEY, email);
    setMode("confirm");
    const nextAvailableAt = Date.now() + 60_000;
    setNow(Date.now());
    setResendAvailableAt(nextAvailableAt);
    setLocalMessage(formatCodeDeliveryMessage(deliveryDetails));
  };

  const handleConfirmSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalMessage(null);
    await onConfirmSignUp({ email, code: confirmationCode });
    window.localStorage.removeItem(PENDING_CONFIRMATION_EMAIL_KEY);
    setMode("login");
    setPassword("");
    setConfirmationCode("");
    setLocalMessage("登録が完了しました。ログインしてください。");
  };

  const handleResendCode = async () => {
    if (resendWaitSeconds > 0) {
      return;
    }
    setLocalMessage(null);
    const deliveryDetails = await onResendConfirmationCode({ email });
    const nextAvailableAt = Date.now() + 60_000;
    setNow(Date.now());
    setResendAvailableAt(nextAvailableAt);
    setLocalMessage(formatCodeDeliveryMessage(deliveryDetails));
  };

  const handleForgotPasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalMessage(null);
    const deliveryDetails = await onForgotPassword({ email });
    setMode("reset-confirm");
    setPassword("");
    setConfirmationCode("");
    setLocalMessage(formatCodeDeliveryMessage(deliveryDetails));
  };

  const handleConfirmForgotPasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalMessage(null);
    await onConfirmForgotPassword({ email, code: confirmationCode, newPassword, phoneNumber: resetPhoneNumber });
    setPassword("");
    setNewPassword("");
    setResetPhoneNumber("");
    setConfirmationCode("");
  };

  const title = mode === "signup"
    ? "新規登録"
    : mode === "confirm"
      ? "メール確認"
      : mode === "reset" || mode === "reset-confirm"
        ? "パスワード再設定"
        : "ログイン";

  return (
    <section className="screen-card login-screen-card">
      <p className="screen-label">Account</p>
      <h2>{title}</h2>
      <p>
        {authMode === "cognito"
          ? "練習履歴と振り返りを保存して、次の面接準備につなげましょう。"
          : "無料体験として、すぐに面接練習を始められます。"}
      </p>
      {errorMessage ? (
        <p className="inline-error" role="alert" aria-live="assertive">
          {errorMessage}
        </p>
      ) : null}
      {localMessage ? <p className="inline-success">{localMessage}</p> : null}
      {authMode === "cognito" ? (
        <>
          <div className="auth-tabs" role="tablist" aria-label="アカウント操作">
            <button
              type="button"
              className={mode === "login" ? "auth-tab auth-tab-active" : "auth-tab"}
              onClick={() => setMode("login")}
              aria-selected={mode === "login"}
              disabled={mode === "confirm"}
              role="tab"
            >
              ログイン
            </button>
            <button
              type="button"
              className={mode === "signup" ? "auth-tab auth-tab-active" : "auth-tab"}
              onClick={() => setMode("signup")}
              aria-selected={mode === "signup"}
              disabled={mode === "confirm" || mode === "reset-confirm"}
              role="tab"
            >
              新規登録
            </button>
          </div>

          {mode === "login" ? (
            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <label>
                メールアドレス
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                パスワード
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={isLoading || !isCognitoConfigured}>
                {isLoading ? "ログイン中" : "ログイン"}
              </button>
              <button
                className="utility-link-button"
                type="button"
                onClick={() => {
                  setLocalMessage(null);
                  setMode("reset");
                }}
              >
                パスワードを再設定する
              </button>
            </form>
          ) : null}

          {mode === "signup" ? (
            <form className="auth-form" onSubmit={handleSignUpSubmit}>
              <label>
                お名前
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                メールアドレス
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                パスワード
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <p className="input-help">8文字以上で、英大文字・英小文字・数字・記号を含めてください。</p>
              <button className="primary-button" type="submit" disabled={isLoading || !isCognitoConfigured}>
                {isLoading ? "登録中" : "新規登録"}
              </button>
            </form>
          ) : null}

          {mode === "confirm" ? (
            <form className="auth-form" onSubmit={handleConfirmSubmit}>
              <label>
                メール確認コード
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={confirmationCode}
                  onChange={(event) => setConfirmationCode(event.target.value)}
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={isLoading || !isCognitoConfigured}>
                {isLoading ? "確認中" : "登録を完了する"}
              </button>
              <button
                className="utility-link-button"
                type="button"
                onClick={handleResendCode}
                disabled={isLoading || resendWaitSeconds > 0 || !isCognitoConfigured}
              >
                {resendWaitSeconds > 0 ? `確認コードを再送する（${resendWaitSeconds}秒後）` : "確認コードを再送する"}
              </button>
              <button className="utility-link-button" type="button" onClick={() => setMode("signup")}>
                入力内容を修正する
              </button>
            </form>
          ) : null}

          {mode === "reset" ? (
            <form className="auth-form" onSubmit={handleForgotPasswordSubmit}>
              <label>
                メールアドレス
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={isLoading || !isCognitoConfigured}>
                {isLoading ? "送信中" : "確認コードを送信"}
              </button>
              <button className="utility-link-button" type="button" onClick={() => setMode("login")}>
                ログインに戻る
              </button>
            </form>
          ) : null}

          {mode === "reset-confirm" ? (
            <form className="auth-form" onSubmit={handleConfirmForgotPasswordSubmit}>
              <label>
                確認コード
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={confirmationCode}
                  onChange={(event) => setConfirmationCode(event.target.value)}
                  required
                />
              </label>
              <label>
                新しいパスワード
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </label>
              <p className="input-help">8文字以上で、英大文字・英小文字・数字・記号を含めてください。</p>
              <label>
                新しい電話番号
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  pattern="0[0-9０-９ー− ()（）\\-]{9,13}"
                  placeholder="090-1234-5678"
                  title="国内の電話番号を入力してください。例: 090-1234-5678"
                  value={resetPhoneNumber}
                  onChange={(event) => setResetPhoneNumber(event.target.value)}
                  required
                />
              </label>
              <p className="input-help">国内の電話番号を入力してください。例: 090-1234-5678</p>
              <button className="primary-button" type="submit" disabled={isLoading || !isCognitoConfigured}>
                {isLoading ? "再設定中" : "パスワードを再設定"}
              </button>
              <button className="utility-link-button" type="button" onClick={() => setMode("reset")}>
                確認コードを送り直す
              </button>
            </form>
          ) : null}
        </>
      ) : (
        <div className="login-actions">
          <button className="primary-button" onClick={onDemoLogin} disabled={isLoading}>
            {isLoading ? "ログイン中" : demoLoginLabel}
          </button>
        </div>
      )}
      {authMode === "cognito" && !isCognitoConfigured ? (
        <p className="inline-error" role="alert" aria-live="assertive">
          ログイン設定が不足しています。
        </p>
      ) : null}
    </section>
  );
}
