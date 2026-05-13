import { useEffect, useState, type FormEvent } from "react";


type LoginScreenProps = {
  onDemoLogin: () => void;
  onPasswordLogin: (payload: { email: string; password: string }) => Promise<void>;
  onSignUp: (payload: { email: string; password: string; phoneNumber: string; name?: string }) => Promise<void>;
  onConfirmSignUp: (payload: { email: string; code: string }) => Promise<void>;
  onResendConfirmationCode: (payload: { email: string }) => Promise<void>;
  authMode?: "demo" | "cognito";
  isCognitoConfigured?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
};


export function LoginScreen({
  onDemoLogin,
  onPasswordLogin,
  onSignUp,
  onConfirmSignUp,
  onResendConfirmationCode,
  authMode = "demo",
  isCognitoConfigured = false,
  isLoading = false,
  errorMessage = null,
}: LoginScreenProps) {
  const [mode, setMode] = useState<"login" | "signup" | "confirm">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
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

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalMessage(null);
    await onPasswordLogin({ email, password });
  };

  const handleSignUpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalMessage(null);
    await onSignUp({ email, password, phoneNumber, name });
    setMode("confirm");
    const nextAvailableAt = Date.now() + 60_000;
    setNow(Date.now());
    setResendAvailableAt(nextAvailableAt);
    setLocalMessage("SMSで確認コードを送信しました。");
  };

  const handleConfirmSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalMessage(null);
    await onConfirmSignUp({ email, code: confirmationCode });
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
    await onResendConfirmationCode({ email });
    const nextAvailableAt = Date.now() + 60_000;
    setNow(Date.now());
    setResendAvailableAt(nextAvailableAt);
    setLocalMessage("SMSで確認コードを再送しました。");
  };

  return (
    <section className="screen-card login-screen-card">
      <p className="screen-label">Account</p>
      <h2>{mode === "signup" ? "新規登録" : mode === "confirm" ? "電話番号確認" : "ログイン"}</h2>
      <p>
        {authMode === "cognito"
          ? "練習履歴と振り返りを保存して、次の面接準備につなげましょう。"
          : "開発中はデモログインからすぐに主要機能へ入れます。"}
      </p>
      {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
      {localMessage ? <p className="inline-success">{localMessage}</p> : null}
      {authMode === "cognito" ? (
        <>
          <div className="auth-tabs" role="tablist" aria-label="アカウント操作">
            <button
              type="button"
              className={mode === "login" ? "auth-tab auth-tab-active" : "auth-tab"}
              onClick={() => setMode("login")}
              aria-selected={mode === "login"}
              role="tab"
            >
              ログイン
            </button>
            <button
              type="button"
              className={mode === "signup" ? "auth-tab auth-tab-active" : "auth-tab"}
              onClick={() => setMode("signup")}
              aria-selected={mode === "signup"}
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
                電話番号
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  pattern="0[0-9０-９ー− ()（）-]{9,13}"
                  placeholder="090-1234-5678"
                  title="国内の電話番号を入力してください。例: 090-1234-5678"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  required
                />
              </label>
              <p className="input-help">国内の電話番号を入力してください。例: 090-1234-5678</p>
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
                SMS確認コード
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
        </>
      ) : (
        <div className="login-actions">
          <button className="primary-button" onClick={onDemoLogin} disabled={isLoading}>
            {isLoading ? "ログイン中" : "デモログインで開始"}
          </button>
        </div>
      )}
      {authMode === "cognito" && !isCognitoConfigured ? (
        <p className="inline-error">ログイン設定が不足しています。</p>
      ) : null}
    </section>
  );
}
