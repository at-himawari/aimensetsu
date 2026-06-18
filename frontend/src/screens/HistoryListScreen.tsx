import { useEffect, useState } from "react";

type HistoryListScreenProps = {
  items: Array<{
    id: string;
    title: string;
    transcript: string[];
    reflection: {
      strengths: string[];
      improvements: string[];
      advice: string;
    };
  }>;
  selectedEntry: {
    id: string;
    title: string;
    transcript: string[];
    reflection: {
      strengths: string[];
      improvements: string[];
      advice: string;
    };
  } | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onBack: () => void;
  onOpenDetail: (id: string) => void;
  onRestart: () => void;
  onDelete: () => Promise<void> | void;
};


export function HistoryListScreen({
  items,
  selectedEntry,
  isLoading = false,
  errorMessage = null,
  onBack,
  onOpenDetail,
  onRestart,
  onDelete,
}: HistoryListScreenProps) {
  const maxVisibleItems = 10;
  const transcriptPreviewCount = 2;
  const visibleItems = items.slice(0, maxVisibleItems);
  const isLimited = items.length > maxVisibleItems;
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);

  useEffect(() => {
    setIsTranscriptExpanded(false);
  }, [selectedEntry?.id]);

  const transcriptLines =
    selectedEntry && !isTranscriptExpanded
      ? selectedEntry.transcript.slice(0, transcriptPreviewCount)
      : selectedEntry?.transcript ?? [];
  const hasMoreTranscript = (selectedEntry?.transcript.length ?? 0) > transcriptPreviewCount;
  const parseTranscriptLine = (line: string) => {
    const [rawSpeaker, ...rest] = line.split(": ");
    const message = rest.join(": ");
    const isAssistant = rawSpeaker === "assistant";

    return {
      id: line,
      speakerLabel: isAssistant ? "AI面接コーチ" : "あなた",
      message,
      className: isAssistant ? "chat-row assistant-row" : "chat-row user-row",
      bubbleClassName: isAssistant ? "chat-bubble assistant-bubble" : "chat-bubble user-bubble",
    };
  };

  return (
    <section className="screen-card history-screen">
      <header className="detail-screen-header history-header">
        <div>
          <p className="screen-label">History</p>
          <h2>履歴</h2>
          <p>
            {isLoading
              ? "履歴を読み込んでいます。"
              : isLimited
              ? `新しい順に ${maxVisibleItems} 件まで表示しています。`
              : `面接練習の記録を ${visibleItems.length} 件表示しています。`}
          </p>
        </div>
      </header>

      <div className="history-layout">
        <section className="history-list-panel">
          <div className="panel-title-row">
            <h3>練習履歴</h3>
            <span>{visibleItems.length} 件</span>
          </div>
          {errorMessage && visibleItems.length === 0 ? <p className="inline-error">{errorMessage}</p> : null}
          <div className="history-list">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                className={selectedEntry?.id === item.id ? "history-list-item active" : "history-list-item"}
                onClick={() => onOpenDetail(item.id)}
                aria-label={item.title}
              >
                <span>{item.title}</span>
                <small aria-hidden="true">詳細を見る</small>
              </button>
            ))}
            {items.length === 0 ? <div className="empty-resume-state">表示できる履歴がありません。</div> : null}
          </div>
        </section>

        {selectedEntry ? (
          <section className="history-detail-panel">
            <div className="panel-title-row">
              <div>
                <h3>{selectedEntry.title}</h3>
                <p>会話ログと振り返りをまとめて確認できます。</p>
              </div>
            </div>
          <div className="conversation-box">
            {transcriptLines.length > 0 ? transcriptLines.map((line) => {
              const item = parseTranscriptLine(line);

              return (
                <div key={item.id} className={item.className}>
                  <p className="chat-speaker">{item.speakerLabel}</p>
                  <div className={item.bubbleClassName}>{item.message}</div>
                </div>
              );
            }) : <p>会話履歴はまだありません。</p>}
            {hasMoreTranscript ? (
              <button
                className="utility-link-button"
                onClick={() => setIsTranscriptExpanded((current) => !current)}
              >
              {isTranscriptExpanded ? "短く表示する" : "会話履歴をすべて見る"}
              </button>
            ) : null}
          </div>
          <div className="reflection-summary">
            <h4>振り返りコメント</h4>
            <div className="reflection-grid">
              {selectedEntry.reflection.strengths.map((item) => (
                <section key={`strength-${item}`} className="reflection-card">
                  <p className="reflection-card-label">良かった点</p>
                  <p>{item}</p>
                </section>
              ))}
              {selectedEntry.reflection.improvements.map((item) => (
                <section key={`improvement-${item}`} className="reflection-card">
                  <p className="reflection-card-label">改善点</p>
                  <p>{item}</p>
                </section>
              ))}
              <section className="reflection-card">
                <p className="reflection-card-label">次回アドバイス</p>
                <p>{selectedEntry.reflection.advice}</p>
              </section>
            </div>
          </div>
        </section>
        ) : (
          <section className="history-detail-panel empty-history-detail">
            <h3>履歴を選択してください</h3>
            <p>左の一覧から練習履歴を選ぶと、会話ログと振り返りを確認できます。</p>
          </section>
        )}
      </div>

      <div className="detail-screen-actions">
        <button className="secondary-button" onClick={onBack}>
          ホームへ戻る
        </button>
        {selectedEntry ? (
          <>
            <button className="secondary-button danger-button" onClick={onDelete}>
              履歴を削除
            </button>
            <button className="primary-button" onClick={onRestart}>
              もう一度練習
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
