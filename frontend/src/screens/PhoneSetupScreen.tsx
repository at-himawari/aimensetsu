import { useState, type FormEvent } from "react";

type PhoneSetupScreenProps = {
  onSendCode: (phoneNumber: string) => Promise<void>;
  onVerifyCode: (code: string) => Promise<void>;
  onEditPhoneNumber?: () => void;
  onLogout: () => void;
  initialCodeSent?: boolean;
  initialMessage?: string | null;
  isLoading?: boolean;
  errorMessage?: string | null;
};

export function PhoneSetupScreen({
  onSendCode,
  onVerifyCode,
  onEditPhoneNumber,
  onLogout,
  initialCodeSent = false,
  initialMessage = null,
  isLoading = false,
  errorMessage = null,
}: PhoneSetupScreenProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(initialCodeSent);
  const [localMessage, setLocalMessage] = useState<string | null>(initialMessage);

  const handlePhoneSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalMessage(null);
    await onSendCode(phoneNumber);
    setIsCodeSent(true);
    setCode("");
    setLocalMessage("SMSで確認コードを送信しました。");
  };

  const handleCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalMessage(null);
    await onVerifyCode(code);
  };

  const handleEditPhoneNumber = () => {
    setIsCodeSent(false);
    setCode("");
    setLocalMessage(null);
    onEditPhoneNumber?.();
  };

  return (
    <section className="screen-card login-screen-card">
      <p className="screen-label">Account</p>
      <h2>電話番号確認</h2>
      <p>システム利用を開始する前に、SMSを受け取れる電話番号を確認します。</p>
      {errorMessage ? (
        <p className="inline-error" role="alert" aria-live="assertive">
          {errorMessage}
        </p>
      ) : null}
      {localMessage ? <p className="inline-success">{localMessage}</p> : null}

      {!isCodeSent ? (
        <form className="auth-form" onSubmit={handlePhoneSubmit}>
          <label>
            電話番号
            <input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              pattern="0[0-9０-９ー− ()（）\\-]{9,13}"
              placeholder="090-1234-5678"
              title="国内の電話番号を入力してください。例: 090-1234-5678"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              required
            />
          </label>
          <p className="input-help">国内の電話番号を入力してください。例: 090-1234-5678</p>
          <button className="primary-button" type="submit" disabled={isLoading}>
            {isLoading ? "送信中" : "確認コードを送信"}
          </button>
          <button className="utility-link-button" type="button" onClick={onLogout}>
            ログアウト
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={handleCodeSubmit}>
          <label>
            SMS確認コード
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={isLoading}>
            {isLoading ? "確認中" : "利用を開始する"}
          </button>
          <button className="utility-link-button" type="button" onClick={handleEditPhoneNumber}>
            電話番号を修正する
          </button>
        </form>
      )}
    </section>
  );
}
