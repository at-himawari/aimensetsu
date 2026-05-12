type ReflectionScreenProps = {
  onHome: () => void;
};


export function ReflectionScreen({ onHome }: ReflectionScreenProps) {
  return (
    <section className="screen-card">
      <p className="screen-label">Reflection</p>
      <h2>振り返り</h2>
      <div className="reflection-grid">
        <section className="reflection-card">
          <p className="reflection-card-label">良かった点</p>
          <p>具体例を交えて話せていた</p>
        </section>
        <section className="reflection-card">
          <p className="reflection-card-label">改善点</p>
          <p>結論から先に話す</p>
        </section>
        <section className="reflection-card">
          <p className="reflection-card-label">次回アドバイス</p>
          <p>冒頭30秒で要点をまとめる</p>
        </section>
      </div>
      <div className="actions">
        <button className="secondary-button" onClick={onHome}>
          ホームへ
        </button>
      </div>
    </section>
  );
}
