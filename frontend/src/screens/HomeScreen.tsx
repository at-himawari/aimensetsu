type HomeScreenProps = {
  creditBalanceMinutes: number;
  hasResume: boolean;
  onStartPractice: () => void;
  onAddCredits: () => void;
  onMove: (screen: "resume" | "history" | "billing") => void;
};


export function HomeScreen({ creditBalanceMinutes, hasResume, onStartPractice, onAddCredits, onMove }: HomeScreenProps) {
  const cannotStartPractice = hasResume && creditBalanceMinutes <= 0;

  return (
    <section className="screen-card">
      <p className="screen-label">Home</p>
      <h2>ホーム</h2>
      <p>準備ができていれば、ここからすぐに面接練習を始められます。</p>
      <div className="mock-list">
        <div>残クレジット: {creditBalanceMinutes}分</div>
        <div>
          {hasResume
            ? "職務経歴書は登録済みです。すぐに面接練習を始められます。"
            : "職務経歴書が未登録です。このまま進むとアップロード画面が開きます。"}
        </div>
      </div>
      <div className="cta-block">
        <button className="primary-button cta-button" onClick={onStartPractice} disabled={cannotStartPractice}>
          {cannotStartPractice ? "クレジット追加が必要です" : hasResume ? "今すぐ面接練習を始める" : "面接練習の準備を始める"}
        </button>
        {cannotStartPractice ? (
          <button className="secondary-button" onClick={onAddCredits}>
            クレジットを追加する
          </button>
        ) : null}
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
