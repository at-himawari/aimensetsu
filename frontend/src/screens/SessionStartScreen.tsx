type ResumeItem = {
  id: string;
  fileName: string;
};

type SessionStartScreenProps = {
  resumes: ResumeItem[];
  selectedResumeId: string | null;
  onBack: () => void;
  onStart: () => void;
  onSelectResume: (resumeId: string) => void;
};


export function SessionStartScreen({ resumes, selectedResumeId, onBack, onStart, onSelectResume }: SessionStartScreenProps) {
  const selectedResume = resumes.find((resume) => resume.id === selectedResumeId) ?? null;

  return (
    <section className="screen-card">
      <p className="screen-label">Session Start</p>
      <h2>面接練習開始</h2>
      <p>職務経歴書と面接モードを選択して、AI との練習を開始します。</p>
      <div className="mock-list">
        <div>選択中 RESUME: {selectedResume?.fileName ?? "未選択"}</div>
        <div>モード: general</div>
      </div>
      <div className="mock-list">
        {resumes.map((resume) => (
          <button
            key={resume.id}
            className={selectedResumeId === resume.id ? "list-item-button selected-button" : "list-item-button"}
            onClick={() => onSelectResume(resume.id)}
          >
            {resume.fileName}
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="secondary-button" onClick={onBack}>
          ホームへ戻る
        </button>
        <button className="primary-button" onClick={onStart} disabled={!selectedResume}>
          面接を開始
        </button>
      </div>
    </section>
  );
}
