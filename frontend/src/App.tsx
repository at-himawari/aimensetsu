import { useState } from "react";

import { BillingScreen } from "./screens/BillingScreen";
import { HistoryListScreen } from "./screens/HistoryListScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ReflectionScreen } from "./screens/ReflectionScreen";
import { ResumeScreen } from "./screens/ResumeScreen";
import { SessionScreen } from "./screens/SessionScreen";
import type { ScreenKey } from "./screens/types";
import { ApiError, createApiClient, type InterviewMessage, type InterviewSession, type Reflection } from "./lib/api/client";
import { useAuth } from "./state/auth";
import { LoadingState } from "./ui/LoadingState";


const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
});

type HistoryItem = {
  id: string;
  title: string;
  transcript: string[];
  reflection: {
    strengths: string[];
    improvements: string[];
    advice: string;
  };
};

function formatHistoryTitle(session: InterviewSession) {
  const startedAt = new Date(session.started_at);
  const dateLabel = Number.isNaN(startedAt.getTime())
    ? session.started_at
    : startedAt.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
  const roleLabel = session.job_role || session.mode || "面接練習";

  return `${dateLabel} ${roleLabel}`;
}

function mapMessagesToTranscript(messages: InterviewMessage[]) {
  return messages.map((message) => `${message.sender_type}: ${message.content}`);
}

function mapReflection(reflection?: Reflection | null): HistoryItem["reflection"] {
  return {
    strengths: reflection?.strengths ?? [],
    improvements: reflection?.improvements ?? [],
    advice: reflection?.advice ?? "まだ振り返りはありません。",
  };
}

function mapSessionToHistoryItem(session: InterviewSession, messages: InterviewMessage[] = [], reflection?: Reflection | null): HistoryItem {
  return {
    id: session.session_id,
    title: formatHistoryTitle(session),
    transcript: mapMessagesToTranscript(messages),
    reflection: mapReflection(reflection),
  };
}

const initialHistoryItems: HistoryItem[] = [
  {
    id: "history_1",
    title: "2026-04-24 Backend Engineer 模擬面接",
    transcript: [
      "assistant: これまでのご経歴を教えてください。",
      "user: バックエンド開発を中心に、API と課金基盤の改善を進めてきました。",
      "assistant: その中で特に成果につながった取り組みを教えてください。",
      "user: 決済処理のボトルネックを見直し、失敗率を大きく下げました。",
    ],
    reflection: {
      strengths: ["具体例を交えて説明できていた"],
      improvements: ["結論を先に伝えると、より伝わりやすくなる"],
      advice: "最初の30秒で役割と成果をまとめて話すと、印象が安定します。",
    },
  },
  {
    id: "history_2",
    title: "2026-04-23 自己紹介集中練習",
    transcript: [
      "assistant: 1分で自己紹介をお願いします。",
      "user: 直近では SaaS プロダクトの改善を担当していました。",
      "assistant: その中で、特に得意な領域は何ですか。",
      "user: ユーザー導線の改善と、継続率を上げるための分析が得意です。",
    ],
    reflection: {
      strengths: ["落ち着いて話せていた"],
      improvements: ["自己紹介の冒頭で専門領域を明確にする"],
      advice: "職種名と得意領域を最初に置くと、聞き手が理解しやすくなります。",
    },
  },
];

type ResumeItem = {
  id: string;
  fileName: string;
};

const initialResumes: ResumeItem[] = [
  { id: "resume_1", fileName: "resume_2026.pdf" },
  { id: "resume_2", fileName: "backend-engineer.pdf" },
];


export default function App() {
  const { authState, loginDemo, logout } = useAuth();
  const isLoggedIn = authState.mode !== "anonymous";
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenKey>("login");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [creditBalanceMinutes, setCreditBalanceMinutes] = useState(30);
  const [historyItems, setHistoryItems] = useState([...initialHistoryItems]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [resumes, setResumes] = useState<ResumeItem[]>([...initialResumes]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(initialResumes[1]?.id ?? null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>(initialHistoryItems[0].id);

  const selectedHistory =
    historyItems.find((item) => item.id === selectedHistoryId) ?? historyItems[0] ?? null;

  const loadHistoryDetail = async (historyId: string) => {
    if (authState.mode === "anonymous") {
      return;
    }

    try {
      const response = await apiClient.getHistoryDetail(authState, historyId);
      const nextItem = mapSessionToHistoryItem(
        response.data.session,
        response.data.messages,
        response.data.reflection,
      );
      setHistoryItems((currentItems) => {
        const hasItem = currentItems.some((item) => item.id === nextItem.id);
        if (!hasItem) {
          return [nextItem, ...currentItems];
        }
        return currentItems.map((item) => (item.id === nextItem.id ? nextItem : item));
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "会話履歴を取得できませんでした。";
      setHistoryError(message);
    }
  };

  const loadHistory = async () => {
    if (authState.mode === "anonymous") {
      return;
    }

    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await apiClient.getHistory(authState);
      const nextItems = response.data.map((session) => mapSessionToHistoryItem(session));
      setHistoryItems(nextItems);

      const nextSelectedId = nextItems[0]?.id ?? "";
      setSelectedHistoryId(nextSelectedId);
      if (nextSelectedId) {
        await loadHistoryDetail(nextSelectedId);
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "履歴を取得できませんでした。";
      setHistoryError(message);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleOpenHistoryDetail = (historyId: string) => {
    setSelectedHistoryId(historyId);
    setScreen("history");
    setIsMenuOpen(false);
    void loadHistoryDetail(historyId);
  };

  const handleDeleteHistory = () => {
    setHistoryItems((currentItems) => {
      const nextItems = currentItems.filter((item) => item.id !== selectedHistoryId);
      if (nextItems.length > 0) {
        setSelectedHistoryId(nextItems[0].id);
      }
      return nextItems;
    });
    setScreen("history");
  };

  const navigateTo = (nextScreen: ScreenKey) => {
    setScreen(nextScreen);
    setIsMenuOpen(false);
    if (nextScreen === "history") {
      void loadHistory();
    }
  };

  const handleUploadResume = (file: File) => {
    const nextResume: ResumeItem = {
      id: `resume_${Date.now()}`,
      fileName: file.name,
    };
    setResumes((currentResumes) => [nextResume, ...currentResumes]);
    setSelectedResumeId(nextResume.id);
  };

  const handleDeleteResume = (resumeId: string) => {
    setResumes((currentResumes) => {
      const nextResumes = currentResumes.filter((resume) => resume.id !== resumeId);
      if (selectedResumeId === resumeId) {
        setSelectedResumeId(nextResumes[0]?.id ?? null);
      }
      return nextResumes;
    });
  };

  const handlePurchaseCredits = () => {
    setCreditBalanceMinutes((currentBalance) => currentBalance + 30);
  };

  const handleStartPracticeFromHome = () => {
    setScreen(resumes.length > 0 ? "session" : "resume");
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setLoginError(null);
    try {
      const response = await apiClient.demoLogin("demo_frontend", "Frontend Demo");
      loginDemo(response.data.access_token, response.data.user.name);
      setScreen("home");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "ログインに失敗しました。";
      setLoginError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={screen === "session" ? "page-shell session-page" : "page-shell"}>
      <section className="hero-card">
        <p className="eyebrow">Interview Practice</p>
        <h1>AI面接コーチ</h1>
        <p className="lead">一人でも、落ち着いて面接練習を進められます。</p>

        <div className="hero-toolbar">
          {!isLoggedIn ? (
            <button
              onClick={handleDemoLogin}
              className="primary-button"
              disabled={isLoading}
            >
              {isLoading ? "ログイン中" : "デモログイン"}
            </button>
          ) : (
            <div className="utility-actions">
              <button
                onClick={() => setIsMenuOpen((current) => !current)}
                className="utility-button menu-toggle"
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                aria-label="メニューを開く"
              >
                <span className="menu-toggle-icon" aria-hidden="true">
                  ☰
                </span>
                <span>メニュー</span>
              </button>
              {isMenuOpen ? (
                <div className="menu-panel" role="menu" aria-label="共通メニュー">
                  <button className="menu-item" role="menuitem" onClick={() => navigateTo("home")}>
                    ホーム
                  </button>
                  <button className="menu-item" role="menuitem" onClick={() => navigateTo("history")}>
                    振り返り・履歴
                  </button>
                  <button className="menu-item" role="menuitem" onClick={() => navigateTo("resume")}>
                    経歴書を管理する
                  </button>
                  <button className="menu-item" role="menuitem" onClick={() => navigateTo("billing")}>
                    追加購入する
                  </button>
                  <button
                    className="menu-item menu-item-danger"
                    role="menuitem"
                    onClick={() => {
                      logout();
                      setIsMenuOpen(false);
                    }}
                  >
                    ログアウト
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {isLoading ? (
          <LoadingState
            title="読み込み中"
            body="少し時間がかかる場合があります。画面はそのままでお待ちください。"
          />
        ) : null}

        <section className="screen-shell">
          {screen === "login" ? (
            <LoginScreen
              onDemoLogin={handleDemoLogin}
              isLoading={isLoading}
              errorMessage={loginError}
            />
          ) : null}
          {screen === "home" ? (
            <HomeScreen
              creditBalanceMinutes={creditBalanceMinutes}
              hasResume={resumes.length > 0}
              onStartPractice={handleStartPracticeFromHome}
              onMove={(nextScreen) => {
                navigateTo(nextScreen);
              }}
            />
          ) : null}
          {screen === "resume" ? (
            <ResumeScreen
              resumes={resumes}
              selectedResumeId={selectedResumeId}
              onBack={() => navigateTo("home")}
              onStart={() => navigateTo("session")}
              onDelete={handleDeleteResume}
              onSelect={setSelectedResumeId}
              onUpload={handleUploadResume}
            />
          ) : null}
          {screen === "session" ? (
            <SessionScreen onFinish={() => navigateTo("reflection")} onBilling={() => navigateTo("billing")} />
          ) : null}
          {screen === "reflection" ? (
            <ReflectionScreen
              onHome={() => navigateTo("home")}
            />
          ) : null}
          {screen === "history" ? (
            <HistoryListScreen
              items={historyItems}
              selectedEntry={selectedHistory}
              isLoading={isHistoryLoading}
              errorMessage={historyError}
              onBack={() => navigateTo("home")}
              onOpenDetail={handleOpenHistoryDetail}
              onRestart={() => navigateTo("session")}
              onDelete={handleDeleteHistory}
            />
          ) : null}
          {screen === "billing" ? (
            <BillingScreen
              availableMinutes={creditBalanceMinutes}
              onBack={() => navigateTo("home")}
              onPurchase={handlePurchaseCredits}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}
