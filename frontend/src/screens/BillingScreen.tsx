type BillingScreenProps = {
  availableMinutes: number;
  onBack: () => void;
  onPurchase: () => Promise<void> | void;
  isLoading?: boolean;
  errorMessage?: string | null;
};


export function BillingScreen({ availableMinutes, onBack, onPurchase, isLoading = false, errorMessage }: BillingScreenProps) {
  return (
    <section className="screen-card billing-screen">
      <p className="screen-label">Billing</p>
      <h2>練習時間を追加</h2>
      <p>面接前にもう少し話す練習をしたいとき、30分単位で練習時間を追加できます。</p>
      <div className="billing-plan">
        <div className="billing-plan-main">
          <h3>30分追加パック</h3>
          <p>自己紹介、深掘り質問、逆質問まで一通り練習しやすい時間です。</p>
        </div>
        <div className="billing-price">
          <span>税込</span>
          <strong>300円</strong>
        </div>
      </div>
      <div className="billing-benefits" aria-label="追加される内容">
        <div>
          <span className="status-label">現在の残り時間</span>
          <strong>{availableMinutes}分</strong>
        </div>
        <div>
          <span className="status-label">追加される時間</span>
          <strong>30分</strong>
        </div>
        <div>
          <span className="status-label">追加後の目安</span>
          <strong>{availableMinutes + 30}分</strong>
        </div>
      </div>
      {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
      <div className="actions">
        <button className="secondary-button" onClick={onBack}>
          ホームへ戻る
        </button>
        <button className="primary-button" onClick={onPurchase} disabled={isLoading}>
          {isLoading ? "購入画面を準備中" : "30分を追加購入する"}
        </button>
      </div>
    </section>
  );
}
