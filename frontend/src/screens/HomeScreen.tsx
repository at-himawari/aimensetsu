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
      <div className="app-home-main">
        <header className="app-home-header">
          <div>
            <p className="screen-label">Home</p>
            <h2>ホーム</h2>
          </div>
          <section className="credit-summary" aria-label={`残クレジット: ${creditBalanceMinutes}分`}>
            <span>残りクレジット</span>
            <strong>{creditBalanceMinutes}</strong>
            <small>分</small>
          </section>
        </header>

        <div className="app-home-grid">
          <div className="home-primary-column">
            <section className="home-action-panel">
              <div>
                <h3>面接練習を開始する</h3>
                <p>
                  {hasResume
                    ? "登録済みの職務経歴書に合わせて、AI面接官と練習しましょう。"
                    : "職務経歴書がなくても、すぐに面接練習を始められます。"}
                </p>
              </div>
              <button className="primary-button cta-button" onClick={cannotStartPractice ? onAddCredits : onStartPractice}>
                {cannotStartPractice ? "クレジットを追加して始める" : "今すぐ面接練習を始める"}
              </button>
            </section>

            <section className="resume-status-panel">
              <div>
                <h3>{hasResume ? "職務経歴書は登録済みです" : "職務経歴書が未登録です"}</h3>
                <p>
                  {hasResume
                    ? "内容に合わせた質問で練習できます。必要に応じて差し替えもできます。"
                    : "より精度の高い質問生成のために、職務経歴書を登録してください。"}
                </p>
              </div>
              <button className="secondary-button" onClick={() => onMove("resume")}>
                経歴書を管理する
              </button>
            </section>
          </div>

          <aside className="home-side-column">
            <section className="recent-history-panel">
              <div className="panel-title-row">
                <h3>最近の履歴</h3>
                <button type="button" onClick={() => onMove("history")}>
                  すべて見る
                </button>
              </div>
              <button className="history-preview-item" type="button" onClick={() => onMove("history")}>
                <span>総合職_面接練習</span>
                <small>2024/05/20　26分</small>
              </button>
              <button className="history-preview-item" type="button" onClick={() => onMove("history")}>
                <span>マーケター職_想定面接</span>
                <small>2024/05/18　18分</small>
              </button>
              <button className="history-preview-item" type="button" onClick={() => onMove("history")}>
                <span>プロダクト職_一次面接</span>
                <small>2024/05/16　31分</small>
              </button>
            </section>

            <button className="secondary-button billing-shortcut" onClick={() => onMove("billing")}>
              追加購入する
            </button>
          </aside>
        </div>
      </div>
    </section>
  );
}
