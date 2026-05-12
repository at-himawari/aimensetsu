type HistoryDetailScreenProps = {
  entry: {
    id: string;
    title: string;
    transcript: string[];
  } | null;
  onBack: () => void;
  onRestart: () => void;
  onDelete: () => void;
};


export function HistoryDetailScreen({ entry, onBack, onRestart, onDelete }: HistoryDetailScreenProps) {
  return (
    <section className="screen-card">
      <p className="screen-label">History Detail</p>
      <h2>練習詳細</h2>
      <p>セッション情報、会話履歴、振り返りをひとまとめに確認します。</p>
      <p>{entry?.title ?? "選択された履歴がありません。"}</p>
      <div className="conversation-box">
        {(entry?.transcript ?? ["assistant: これまでのご経歴を教えてください。", "user: バックエンド開発を中心に..."]).map(
          (line) => (
            <p key={line}>{line}</p>
          ),
        )}
      </div>
      <div className="actions">
        <button className="secondary-button" onClick={onBack}>
          履歴一覧へ
        </button>
        <button className="secondary-button" onClick={onDelete}>
          履歴を削除
        </button>
        <button className="primary-button" onClick={onRestart}>
          もう一度練習
        </button>
      </div>
    </section>
  );
}
