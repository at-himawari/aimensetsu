type HomeScreenProps = {
  creditBalanceMinutes: number;
  hasResume: boolean;
  onStartPractice: () => void;
  onAddCredits: () => void;
  onMove: (screen: "resume" | "history" | "billing") => void;
};


export function HomeScreen({ creditBalanceMinutes, hasResume, onStartPractice, onAddCredits, onMove }: HomeScreenProps) {
  const cannotStartPractice = creditBalanceMinutes <= 0;

  return (
    <section className="screen-card home-screen">
      <p className="screen-label">Home</p>
      <h2>ホーム</h2>
      <p>職務経歴書がなくても、すぐに面接練習を始められます。</p>
      <div className="home-status">
        <div aria-label={`残クレジット: ${creditBalanceMinutes}分`}>
          <span className="status-label">残クレジット</span>
          <strong>{creditBalanceMinutes}分</strong>
        </div>
        <div aria-label={`職務経歴書: ${hasResume ? "登録済み" : "未登録"}`}>
          <span className="status-label">職務経歴書</span>
          <strong>{hasResume ? "登録済み" : "未登録"}</strong>
        </div>
      </div>
      <p className="section-note">
          {hasResume
            ? "職務経歴書は登録済みです。すぐに面接練習を始められます。"
            : "職務経歴書を登録すると、内容に合わせた質問で練習できます。"}
      </p>
      <div className="cta-block">
        <button className="primary-button cta-button" onClick={cannotStartPractice ? onAddCredits : onStartPractice}>
          {cannotStartPractice ? "クレジットを追加して始める" : "今すぐ面接練習を始める"}
        </button>
      </div>
      <div className="card-grid secondary-grid">
        <button className="secondary-button" onClick={() => onMove("resume")}>
          経歴書を管理する
        </button>
        <button className="secondary-button" onClick={() => onMove("history")}>
          履歴を見る
        </button>
        <button className="secondary-button" onClick={() => onMove("billing")}>
          追加購入する
        </button>
      </div>
    </section>
  );
}
