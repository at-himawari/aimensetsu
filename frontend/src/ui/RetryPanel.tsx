type RetryPanelProps = {
  message: string;
  onRetry: () => void;
};


export function RetryPanel({ message, onRetry }: RetryPanelProps) {
  return (
    <section className="retry-panel" role="alert">
      <strong>再試行できます</strong>
      <p>{message}</p>
      <button type="button" className="retry-button" onClick={onRetry}>
        もう一度試す
      </button>
    </section>
  );
}
