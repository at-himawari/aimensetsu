type LoginScreenProps = {
  onDemoLogin: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
};


export function LoginScreen({ onDemoLogin, isLoading = false, errorMessage = null }: LoginScreenProps) {
  return (
    <section className="screen-card">
      <p className="screen-label">Login</p>
      <h2>ログイン</h2>
      <p>開発中はデモログインからすぐに主要機能へ入れます。</p>
      {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
      <button className="primary-button" onClick={onDemoLogin} disabled={isLoading}>
        {isLoading ? "ログイン中" : "デモログインで開始"}
      </button>
    </section>
  );
}
