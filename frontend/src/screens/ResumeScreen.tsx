import { useId, useState, type ChangeEvent } from "react";


const MAX_RESUME_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_RESUME_FILE_SIZE_MB = MAX_RESUME_FILE_SIZE_BYTES / 1024 / 1024;

type ResumeItem = {
  id: string;
  fileName: string;
  hasExtractedText?: boolean;
};

type ResumeScreenProps = {
  resumes: ResumeItem[];
  selectedResumeId: string | null;
  onBack: () => void;
  onStart: () => void;
  onDelete: (resumeId: string) => Promise<void> | void;
  onSelect: (resumeId: string) => void;
  onUpload: (file: File) => Promise<void> | void;
  isLoading?: boolean;
  errorMessage?: string | null;
};


export function ResumeScreen({
  resumes,
  selectedResumeId,
  onBack,
  onStart,
  onDelete,
  onSelect,
  onUpload,
  isLoading = false,
  errorMessage,
}: ResumeScreenProps) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.type !== "application/pdf") {
      setError("PDF ファイルのみアップロードできます。");
      return;
    }
    if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
      setError(`ファイルサイズは ${MAX_RESUME_FILE_SIZE_MB}MB 以下にしてください。`);
      return;
    }
    setError(null);
    await onUpload(file);
  };

  return (
    <section className="screen-card">
      <p className="screen-label">Resume</p>
      <h2>履歴書・職務経歴書アップロード</h2>
      <p>PDF の登録状況を確認し、面接時に使う職務経歴書を管理します。</p>
      <div className="mock-list">
        {resumes.map((resume) => (
          <div key={resume.id} className={selectedResumeId === resume.id ? "mock-list-item selected" : "mock-list-item"}>
            <button className="list-item-button" onClick={() => onSelect(resume.id)} aria-label={resume.fileName}>
              <span>{resume.fileName}</span>
              <span className="list-item-meta" aria-hidden="true">
                {resume.hasExtractedText ? "本文を読み込み済み" : "本文抽出なし"}
              </span>
            </button>
            <button className="secondary-button danger-button" onClick={() => onDelete(resume.id)}>
              削除
            </button>
          </div>
        ))}
        {resumes.length === 0 ? <div>まだ RESUME がありません。</div> : null}
      </div>
      <div className="form-stack">
        <label htmlFor={inputId}>PDF を追加</label>
        <input id={inputId} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} disabled={isLoading} />
        {error || errorMessage ? <p className="inline-error">{error ?? errorMessage}</p> : null}
      </div>
      <div className="actions">
        <button className="secondary-button" onClick={onBack}>
          ホームへ戻る
        </button>
        <button className="primary-button" onClick={onStart} disabled={resumes.length === 0 || isLoading}>
          {isLoading ? "処理中" : "面接を始める"}
        </button>
      </div>
    </section>
  );
}
