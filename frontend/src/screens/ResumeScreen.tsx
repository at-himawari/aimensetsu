import { useId, useRef, useState, type ChangeEvent } from "react";


const MAX_RESUME_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_RESUME_FILE_SIZE_MB = MAX_RESUME_FILE_SIZE_BYTES / 1024 / 1024;
const MAX_RESUME_FILES = 2;

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
  onClearError?: () => void;
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
  onClearError,
  isLoading = false,
  errorMessage,
}: ResumeScreenProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const hasReachedResumeLimit = resumes.length >= MAX_RESUME_FILES;

  const validateFile = (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return "PDF ファイルのみアップロードできます。";
    }
    if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
      return `ファイルサイズは ${MAX_RESUME_FILE_SIZE_MB}MB 以下にしてください。`;
    }
    return null;
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (hasReachedResumeLimit) {
      setSelectedFile(null);
      setError(`履歴書・職務経歴書は${MAX_RESUME_FILES}件まで登録できます。`);
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const validationError = validateFile(file);
    if (validationError) {
      setSelectedFile(null);
      setError(validationError);
      event.target.value = "";
      return;
    }
    setError(null);
    onClearError?.();
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (hasReachedResumeLimit) {
      setError(`履歴書・職務経歴書は${MAX_RESUME_FILES}件まで登録できます。`);
      return;
    }
    const file = selectedFile ?? inputRef.current?.files?.[0] ?? null;
    if (!file) {
      setError("アップロードする PDF を選択してください。");
      return;
    }
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsUploading(true);
    setError(null);
    onClearError?.();
    try {
      await onUpload(file);
      setSelectedFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } finally {
      setIsUploading(false);
    }
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
        {resumes.length === 0 ? <div>履歴書・職務経歴書はまだ登録されていません。</div> : null}
      </div>
      <div className="form-stack">
        <label htmlFor={inputId}>PDF を追加</label>
        <input ref={inputRef} id={inputId} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} disabled={hasReachedResumeLimit} />
        {selectedFile ? <p className="selected-file-name">選択中: {selectedFile.name}</p> : null}
        {hasReachedResumeLimit ? <p className="section-note">登録できる履歴書・職務経歴書は2件までです。追加する場合は不要なPDFを削除してください。</p> : null}
        {error || errorMessage ? <p className="inline-error">{error ?? errorMessage}</p> : null}
        <button className="primary-button upload-button" onClick={handleUpload} disabled={isUploading || hasReachedResumeLimit}>
          {isUploading ? "アップロード中" : "アップロードする"}
        </button>
      </div>
      <div className="actions">
        <button className="secondary-button" onClick={onBack}>
          ホームへ戻る
        </button>
        <button className="primary-button" onClick={onStart}>
          面接を始める
        </button>
      </div>
    </section>
  );
}
