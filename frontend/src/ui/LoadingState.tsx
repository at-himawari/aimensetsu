type LoadingStateProps = {
  title: string;
  body: string;
};


export function LoadingState({ title, body }: LoadingStateProps) {
  return (
    <section className="loading-card" aria-live="polite">
      <strong>{title}</strong>
      <p className="loading-body">{body}</p>
      <div className="loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
