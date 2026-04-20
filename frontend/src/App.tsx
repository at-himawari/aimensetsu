import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, Feedback, Me, PracticeSession } from "./api";
import { VoiceMesh } from "./components/VoiceMesh";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [active, setActive] = useState<PracticeSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "今日はよろしくお願いします。まず自己紹介をお願いします。" },
  ]);
  const [title, setTitle] = useState("一次面接の練習");
  const [role, setRole] = useState("Webアプリケーションエンジニア");
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationPhone, setVerificationPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [localCode, setLocalCode] = useState("");

  const intensity = useMemo(() => Math.min(90, answer.length * 1.7 + messages.length * 5), [answer, messages.length]);

  async function refresh() {
    const [meResult, sessionsResult] = await Promise.all([api.me(), api.sessions()]);
    setMe(meResult);
    setSessions(sessionsResult.sessions);
    if (!active && sessionsResult.sessions[0]) setActive(sessionsResult.sessions[0]);
  }

  useEffect(() => {
    refresh().catch((error) => setNotice(error.message));
  }, []);

  async function startSession(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.createSession({ title, role });
      setActive(result.session);
      setMessages([{ role: "assistant", content: "今日はよろしくお願いします。まず自己紹介をお願いします。" }]);
      setFeedback(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendAnswer(event: FormEvent) {
    event.preventDefault();
    if (!active || !answer.trim()) return;
    const content = answer.trim();
    setAnswer("");
    setMessages((current) => [...current, { role: "user", content }]);
    setBusy(true);
    try {
      const result = await api.sendMessage(active.id, content);
      setMessages((current) => [...current, { role: "assistant", content: result.message.content }]);
      setMe((current) => (current ? { ...current, quotaMinutes: result.quotaMinutes } : current));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "送信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!active || !file) return;
    setBusy(true);
    try {
      const result = await api.uploadDocument(active.id, file);
      setNotice(`${result.filename} を読み込みました。`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createFeedback() {
    if (!active) return;
    setBusy(true);
    try {
      setFeedback(await api.feedback(active.id));
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    const result = await api.checkout();
    window.location.href = result.url;
  }

  async function startPhoneVerification(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.startPhoneVerification(phoneNumber);
      setVerificationPhone(result.phoneNumber);
      setLocalCode(result.verificationCode ?? "");
      setNotice("確認コードを送信しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "確認コードを送信できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhone(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.verifyPhone(verificationPhone || phoneNumber, verificationCode);
      setNotice("電話番号を認証しました。");
      setVerificationCode("");
      setLocalCode("");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "電話番号を認証できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function removeSession(id: number) {
    await api.deleteSession(id);
    setSessions((current) => current.filter((item) => item.id !== id));
    if (active?.id === id) setActive(null);
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-5 md:grid-cols-[1fr_360px] md:px-8">
        <div className="space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <p className="text-sm font-semibold text-moss">AI面接コーチ</p>
              <h1 className="text-3xl font-bold tracking-normal md:text-5xl">次の回答を、一緒に磨く。</h1>
            </div>
            <div className="rounded-[8px] border border-line bg-white px-4 py-3 text-sm shadow-calm">
              <p className="font-semibold">{me?.name ?? "デモユーザー"}</p>
              <p>残り {me?.quotaMinutes ?? 30} 分</p>
            </div>
          </header>

          <form onSubmit={startSession} className="grid gap-3 border-b border-line pb-5 md:grid-cols-[1fr_1fr_auto]">
            <label className="grid gap-1 text-sm font-semibold">
              練習名
              <input className="rounded-[8px] border border-line px-3 py-3" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              応募職種
              <input className="rounded-[8px] border border-line px-3 py-3" value={role} onChange={(event) => setRole(event.target.value)} />
            </label>
            <button className="self-end rounded-[8px] bg-ink px-5 py-3 font-semibold text-white" disabled={busy}>
              練習開始
            </button>
          </form>

          <VoiceMesh intensity={intensity} active={Boolean(active)} />

          {me?.requiresPhoneVerification && (
            <section className="grid gap-4 border-y border-line bg-white px-4 py-5">
              <div>
                <p className="text-sm font-bold text-coral">電話番号認証が必要です</p>
                <p className="mt-1 leading-7">練習を始める前に、SMSで確認できる電話番号を登録してください。</p>
              </div>
              <form onSubmit={startPhoneVerification} className="grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="grid gap-1 text-sm font-semibold">
                  電話番号
                  <input
                    className="rounded-[8px] border border-line px-3 py-3"
                    placeholder="09012345678"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                  />
                </label>
                <button className="self-end rounded-[8px] bg-ink px-5 py-3 font-semibold text-white" disabled={busy || !phoneNumber}>
                  確認コードを送る
                </button>
              </form>
              {verificationPhone && (
                <form onSubmit={verifyPhone} className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <label className="grid gap-1 text-sm font-semibold">
                    確認コード
                    <input
                      className="rounded-[8px] border border-line px-3 py-3"
                      inputMode="numeric"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value)}
                    />
                  </label>
                  <button className="self-end rounded-[8px] bg-moss px-5 py-3 font-semibold text-white" disabled={busy || !verificationCode}>
                    認証する
                  </button>
                </form>
              )}
              {localCode && <p className="rounded-[8px] border border-line bg-skyline p-3 text-sm">開発用確認コード: {localCode}</p>}
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <section className="space-y-3">
              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {messages.map((message, index) => (
                  <article
                    key={`${message.role}-${index}`}
                    className={`rounded-[8px] border px-4 py-3 ${
                      message.role === "assistant" ? "border-line bg-white" : "border-moss bg-skyline"
                    }`}
                  >
                    <p className="text-xs font-bold text-moss">{message.role === "assistant" ? "コーチ" : "あなた"}</p>
                    <p className="mt-1 leading-7">{message.content}</p>
                  </article>
                ))}
              </div>

              <form onSubmit={sendAnswer} className="grid gap-3">
                <textarea
                  className="min-h-32 rounded-[8px] border border-line px-4 py-3 leading-7"
                  placeholder="面接で話すつもりで回答してください。"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                />
                <div className="flex flex-wrap gap-3">
                  <button className="rounded-[8px] bg-moss px-5 py-3 font-semibold text-white" disabled={!active || busy}>
                    回答する
                  </button>
                  <button type="button" className="rounded-[8px] border border-line px-5 py-3 font-semibold" onClick={createFeedback} disabled={!active || busy}>
                    振り返る
                  </button>
                  <label className="cursor-pointer rounded-[8px] border border-line px-5 py-3 font-semibold">
                    職務経歴書を追加
                    <input className="sr-only" type="file" accept=".txt,.md,.csv,.pdf,.doc,.docx" onChange={(event) => upload(event.target.files?.[0])} />
                  </label>
                </div>
              </form>
            </section>

            <aside className="space-y-4">
              <section className="rounded-[8px] border border-line bg-white p-4">
                <p className="text-sm font-bold text-moss">クレジット</p>
                <p className="mt-2 text-3xl font-bold">{me?.quotaMinutes ?? 30}分</p>
                <p className="mt-1 text-sm">30分 {me?.blockPriceJpy ?? 300}円</p>
                <button className="mt-4 w-full rounded-[8px] bg-coral px-4 py-3 font-semibold text-white" onClick={checkout}>
                  30分追加
                </button>
              </section>

              {feedback && (
                <section className="rounded-[8px] border border-line bg-white p-4">
                  <p className="text-sm font-bold text-moss">振り返り</p>
                  <p className="mt-2 leading-7">{feedback.summary}</p>
                  <p className="mt-3 font-semibold">良かった点</p>
                  <ul className="list-disc pl-5 text-sm leading-6">{feedback.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
                  <p className="mt-3 font-semibold">改善点</p>
                  <ul className="list-disc pl-5 text-sm leading-6">{feedback.improvements.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              )}
            </aside>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[8px] border border-line bg-white p-4 shadow-calm">
            <h2 className="text-lg font-bold">練習履歴</h2>
            <div className="mt-4 space-y-3">
              {sessions.length === 0 && <p className="text-sm">まだ履歴がありません。</p>}
              {sessions.map((session) => (
                <article key={session.id} className="rounded-[8px] border border-line p-3">
                  <button className="block w-full text-left font-semibold" onClick={() => setActive(session)}>
                    {session.title}
                  </button>
                  <p className="mt-1 text-sm">{session.role || "職種未設定"} / {session.minutesUsed}分</p>
                  <div className="mt-3 flex gap-2">
                    <button className="rounded-[8px] border border-line px-3 py-2 text-sm" onClick={() => setActive(session)}>
                      続ける
                    </button>
                    <button className="rounded-[8px] border border-coral px-3 py-2 text-sm text-coral" onClick={() => removeSession(session.id)}>
                      削除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
          {notice && <p className="rounded-[8px] border border-line bg-white p-3 text-sm">{notice}</p>}
        </aside>
      </section>
    </main>
  );
}
