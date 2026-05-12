type BillingScreenProps = {
  availableMinutes: number;
  onBack: () => void;
  onPurchase: () => void;
};


export function BillingScreen({ availableMinutes, onBack, onPurchase }: BillingScreenProps) {
  return (
    <section className="screen-card">
      <p className="screen-label">Billing</p>
      <h2>課金</h2>
      <div className="mock-list">
        <div>現在残高: {availableMinutes}分</div>
        <div>プラン: minutes_30</div>
        <div>価格: 300円</div>
        <div>追加時間: 30分</div>
      </div>
      <div className="actions">
        <button className="secondary-button" onClick={onBack}>
          ホームへ戻る
        </button>
        <button className="primary-button" onClick={onPurchase}>Stripe Checkoutへ進む</button>
      </div>
    </section>
  );
}
