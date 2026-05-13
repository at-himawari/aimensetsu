type ReflectionScreenProps = {
  reflection: {
    strengths: string[];
    improvements: string[];
    advice: string;
  } | null;
  onHome: () => void;
};


export function ReflectionScreen({ reflection, onHome }: ReflectionScreenProps) {
  const strengths = reflection?.strengths.length ? reflection.strengths : ["まだ振り返りはありません。"];
  const improvements = reflection?.improvements.length ? reflection.improvements : ["まだ振り返りはありません。"];
  const advice = reflection?.advice || "まだ振り返りはありません。";

  return (
    <section className="screen-card">
      <p className="screen-label">Reflection</p>
      <h2>振り返り</h2>
      <div className="reflection-grid">
        <section className="reflection-card">
          <p className="reflection-card-label">良かった点</p>
          {strengths.map((strength) => (
            <p key={strength}>{strength}</p>
          ))}
        </section>
        <section className="reflection-card">
          <p className="reflection-card-label">改善点</p>
          {improvements.map((improvement) => (
            <p key={improvement}>{improvement}</p>
          ))}
        </section>
        <section className="reflection-card">
          <p className="reflection-card-label">次回アドバイス</p>
          <p>{advice}</p>
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
