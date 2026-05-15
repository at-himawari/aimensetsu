import { useEffect, useState } from "react";

import { BillingScreen } from "./screens/BillingScreen";
import { HistoryListScreen } from "./screens/HistoryListScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ReflectionScreen } from "./screens/ReflectionScreen";
import { ResumeScreen } from "./screens/ResumeScreen";
import { SessionScreen } from "./screens/SessionScreen";
import type { ScreenKey } from "./screens/types";
import {
  confirmSignUpWithCognito,
  exchangeCognitoCode,
  getCognitoConfig,
  loginWithCognitoPassword,
  readCognitoCallback,
  resendConfirmationCodeWithCognito,
  signUpWithCognito,
} from "./lib/auth/cognito";
import { ApiError, createApiClient, type InterviewMessage, type InterviewSession, type Reflection, type ResumeFile } from "./lib/api/client";
import { useAuth, type AuthState } from "./state/auth";
import { LoadingState } from "./ui/LoadingState";


const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
});
const authMode = import.meta.env.MODE === "test" || import.meta.env.VITE_AUTH_MODE !== "cognito" ? "demo" : "cognito";
const cognitoConfig = getCognitoConfig();

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
  hasExtractedText?: boolean;
};

const initialResumes: ResumeItem[] = [];

function mapResumeFile(resume: ResumeFile): ResumeItem {
  return {
    id: resume.resume_id,
    fileName: resume.title || resume.file_name,
    hasExtractedText: resume.has_extracted_text,
  };
}


export default function App() {
  const { authState, loginDemo, setJwt, logout } = useAuth();
  const isLoggedIn =
    authState.mode === "demo"
      ? Boolean(authState.demoUserId)
      : authState.mode === "jwt"
        ? Boolean(authState.accessToken)
        : false;
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenKey>("login");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [creditBalanceMinutes, setCreditBalanceMinutes] = useState(30);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState([...initialHistoryItems]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [resumes, setResumes] = useState<ResumeItem[]>([...initialResumes]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(initialResumes[0]?.id ?? null);
  const [isResumeLoading, setIsResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>(initialHistoryItems[0].id);
  const [latestReflection, setLatestReflection] = useState<HistoryItem["reflection"] | null>(null);
  const [isStartWithoutResumeDialogOpen, setIsStartWithoutResumeDialogOpen] = useState(false);

  const selectedHistory =
    historyItems.find((item) => item.id === selectedHistoryId) ?? historyItems[0] ?? null;

  const completeLogin = async (nextAuthState: AuthState) => {
    await Promise.all([
      loadResumes(nextAuthState),
      loadCreditBalance(nextAuthState),
    ]);
    setScreen("home");
  };

  const loadCreditBalance = async (nextAuthState: AuthState = authState) => {
    if (nextAuthState.mode === "anonymous") {
      return null;
    }

    try {
      const response = await apiClient.getCreditBalance(nextAuthState);
      setCreditBalanceMinutes(response.data.available_minutes);
      return response.data.available_minutes;
    } catch {
      // 残高取得に失敗しても、主要導線は止めずに直近表示を維持します。
      return null;
    }
  };

  const confirmCheckoutIfNeeded = async (nextAuthState: AuthState, checkoutSessionId: string | null) => {
    if (!checkoutSessionId) {
      return null;
    }

    try {
      const response = await apiClient.confirmCheckoutSession(nextAuthState, checkoutSessionId);
      setCreditBalanceMinutes(response.data.available_minutes);
      return response.data.available_minutes;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (authMode !== "cognito" || !cognitoConfig || authState.mode !== "anonymous") {
      return;
    }

    const callback = readCognitoCallback(window.location.search);
    if (!callback) {
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setLoginError(null);

    exchangeCognitoCode(cognitoConfig, callback.code, callback.state)
      .then(async (tokenResponse) => {
        if (!isActive) {
          return;
        }
        const token = tokenResponse.access_token;
        if (!token) {
          throw new Error("ログイン情報を取得できませんでした。");
        }
        const nextAuthState: AuthState = {
          mode: "jwt",
          demoUserId: null,
          accessToken: token,
        };
        setJwt(token);
        window.history.replaceState({}, "", window.location.pathname);
        await completeLogin(nextAuthState);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        const message = error instanceof Error ? error.message : "ログインに失敗しました。";
        setLoginError(message);
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [authState.mode]);

  useEffect(() => {
    if (authState.mode === "anonymous") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get("checkout");
    const checkoutSessionId = params.get("checkout_session_id");
    let isActive = true;
    if (checkoutStatus === "success" || screen === "login") {
      setScreen("home");
    }
    if (checkoutStatus === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      const pollCreditBalance = async (remainingAttempts: number) => {
        if (!isActive || remainingAttempts <= 0) {
          return;
        }
        const confirmedMinutes = await confirmCheckoutIfNeeded(authState, checkoutSessionId);
        const availableMinutes = confirmedMinutes ?? await loadCreditBalance(authState);
        if (availableMinutes !== null && availableMinutes > 0) {
          return;
        }
        if (remainingAttempts === 5) {
          void pollCreditBalance(remainingAttempts - 1);
          return;
        }
        window.setTimeout(() => {
          void pollCreditBalance(remainingAttempts - 1);
        }, 500);
      };
      void pollCreditBalance(5);
    } else {
      void loadCreditBalance(authState);
    }

    return () => {
      isActive = false;
    };
  }, [authState]);

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

  const loadResumes = async (nextAuthState: AuthState = authState) => {
    if (nextAuthState.mode === "anonymous") {
      return;
    }

    setIsResumeLoading(true);
    setResumeError(null);
    try {
      const response = await apiClient.listResumes(nextAuthState);
      const nextResumes = response.data.map(mapResumeFile);
      setResumes(nextResumes);
      setSelectedResumeId((currentId) => {
        if (currentId && nextResumes.some((resume) => resume.id === currentId)) {
          return currentId;
        }
        return nextResumes[0]?.id ?? null;
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setResumes([]);
        setSelectedResumeId(null);
        setResumeError(null);
        return;
      }
      const message = error instanceof ApiError ? error.message : "職務経歴書を取得できませんでした。";
      setResumeError(message);
    } finally {
      setIsResumeLoading(false);
    }
  };

  const handleOpenHistoryDetail = (historyId: string) => {
    setSelectedHistoryId(historyId);
    setScreen("history");
    setIsMenuOpen(false);
    void loadHistoryDetail(historyId);
  };

  const handleDeleteHistory = async () => {
    if (!selectedHistoryId) {
      return;
    }

    if (authState.mode !== "anonymous") {
      try {
        await apiClient.deleteHistory(authState, selectedHistoryId);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "履歴を削除できませんでした。";
        setHistoryError(message);
        return;
      }
    }

    setHistoryItems((currentItems) => {
      const nextItems = currentItems.filter((item) => item.id !== selectedHistoryId);
      if (nextItems.length > 0) {
        setSelectedHistoryId(nextItems[0].id);
      } else {
        setSelectedHistoryId("");
      }
      return nextItems;
    });
    setHistoryError(null);
    setScreen("history");
  };

  const navigateTo = (nextScreen: ScreenKey) => {
    setScreen(nextScreen);
    setIsMenuOpen(false);
    if (nextScreen === "home" || nextScreen === "billing") {
      void loadCreditBalance();
    }
    if (nextScreen === "history") {
      void loadHistory();
    }
    if (nextScreen === "resume") {
      void loadResumes();
    }
  };

  const handleUploadResume = async (file: File) => {
    if (authState.mode === "anonymous") {
      setResumeError("ログインするとアップロードできます。");
      return;
    }

    setIsResumeLoading(true);
    setResumeError(null);
    try {
      const response = await apiClient.uploadResume(authState, file, file.name);
      const nextResume = mapResumeFile(response.data);
      setResumes((currentResumes) => [nextResume, ...currentResumes.filter((resume) => resume.id !== nextResume.id)]);
      setSelectedResumeId(nextResume.id);
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof DOMException && error.name === "AbortError"
          ? "アップロードに時間がかかっています。ファイルサイズや通信状況を確認して、もう一度お試しください。"
          : "職務経歴書をアップロードできませんでした。";
      setResumeError(message);
    } finally {
      setIsResumeLoading(false);
    }
  };

  const handleDeleteResume = async (resumeId: string) => {
    if (authState.mode !== "anonymous") {
      try {
        await apiClient.deleteResume(authState, resumeId);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "職務経歴書を削除できませんでした。";
        setResumeError(message);
        return;
      }
    }

    setResumes((currentResumes) => {
      const nextResumes = currentResumes.filter((resume) => resume.id !== resumeId);
      if (selectedResumeId === resumeId) {
        setSelectedResumeId(nextResumes[0]?.id ?? null);
      }
      return nextResumes;
    });
  };

  const handlePurchaseCredits = async () => {
    if (authState.mode === "anonymous") {
      setBillingError("ログイン後に購入できます。");
      return;
    }

    setIsBillingLoading(true);
    setBillingError(null);
    try {
      const origin = window.location.origin;
      const response = await apiClient.createCheckoutSession(authState, {
        plan_code: "minutes_30",
        quantity: 1,
        success_url: `${origin}/?checkout=success&checkout_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancel`,
      });
      window.location.assign(response.data.checkout_url);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Checkoutを開始できませんでした。";
      setBillingError(message);
    } finally {
      setIsBillingLoading(false);
    }
  };

  const handleStartPracticeFromHome = () => {
    if (resumes.length === 0) {
      setSelectedResumeId(null);
      setIsStartWithoutResumeDialogOpen(true);
      setIsMenuOpen(false);
      return;
    }
    setScreen("session");
    setIsMenuOpen(false);
  };

  const handleStartPracticeWithoutResume = () => {
    setSelectedResumeId(null);
    setIsStartWithoutResumeDialogOpen(false);
    setScreen("session");
    setIsMenuOpen(false);
  };

  const handleAddResumeFromStartDialog = () => {
    setIsStartWithoutResumeDialogOpen(false);
    navigateTo("resume");
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setLoginError(null);
    try {
      const response = await apiClient.demoLogin("demo_frontend", "Frontend Demo");
      const nextAuthState: AuthState = {
        mode: "demo",
        demoUserId: response.data.access_token,
        accessToken: null,
      };
      loginDemo(response.data.access_token, response.data.user.name);
      await completeLogin(nextAuthState);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "ログインに失敗しました。";
      setLoginError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordLogin = async (payload: { email: string; password: string }) => {
    if (!cognitoConfig) {
      setLoginError("ログイン設定が不足しています。");
      return;
    }

    setIsLoading(true);
    setLoginError(null);
    try {
      const tokenResponse = await loginWithCognitoPassword(cognitoConfig, payload);
      const token = tokenResponse.accessToken;
      if (!token) {
        throw new Error("ログイン情報を取得できませんでした。");
      }
      const nextAuthState: AuthState = {
        mode: "jwt",
        demoUserId: null,
        accessToken: token,
      };
      setJwt(token);
      await completeLogin(nextAuthState);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ログインに失敗しました。";
      setLoginError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (payload: { email: string; password: string; phoneNumber: string; name?: string }) => {
    if (!cognitoConfig) {
      setLoginError("ログイン設定が不足しています。");
      return;
    }

    setIsLoading(true);
    setLoginError(null);
    try {
      await signUpWithCognito(cognitoConfig, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "新規登録に失敗しました。";
      setLoginError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSignUp = async (payload: { email: string; code: string }) => {
    if (!cognitoConfig) {
      setLoginError("ログイン設定が不足しています。");
      return;
    }

    setIsLoading(true);
    setLoginError(null);
    try {
      await confirmSignUpWithCognito(cognitoConfig, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "確認に失敗しました。";
      setLoginError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendConfirmationCode = async (payload: { email: string }) => {
    if (!cognitoConfig) {
      setLoginError("ログイン設定が不足しています。");
      return;
    }

    setIsLoading(true);
    setLoginError(null);
    try {
      await resendConfirmationCodeWithCognito(cognitoConfig, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "確認コードの再送に失敗しました。";
      setLoginError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    setIsMenuOpen(false);
    setScreen("login");
  };

  return (
    <main className={screen === "session" ? "page-shell session-page" : screen === "login" ? "page-shell login-page" : "page-shell app-page"}>
      <section className="hero-card">
        <p className="eyebrow">Interview Practice</p>
        <h1>AI面接コーチ</h1>
        <p className="lead">本番前に、納得いくまで面接練習を重ねられます。</p>
        {screen === "login" ? (
          <section className="top-features" aria-label="AI面接コーチの特徴">
            <article className="top-feature-card">
              <span className="top-feature-number">01</span>
              <h2>経歴書に合わせた質問</h2>
              <p>アップロードした内容をもとに、職種や経験に沿った面接練習ができます。</p>
            </article>
            <article className="top-feature-card">
              <span className="top-feature-number">02</span>
              <h2>ひとりで何度も練習</h2>
              <p>声に出して答える練習を、時間を選ばず自分のペースで進められます。</p>
            </article>
            <article className="top-feature-card">
              <span className="top-feature-number">03</span>
              <h2>振り返りを保存</h2>
              <p>良かった点と改善点を残し、次の練習で意識するポイントを明確にします。</p>
            </article>
          </section>
        ) : null}

        {isLoggedIn ? (
          <div className="hero-toolbar">
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
                    onClick={handleLogout}
                  >
                    ログアウト
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

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
              onPasswordLogin={handlePasswordLogin}
              onSignUp={handleSignUp}
              onConfirmSignUp={handleConfirmSignUp}
              onResendConfirmationCode={handleResendConfirmationCode}
              authMode={authMode}
              isCognitoConfigured={Boolean(cognitoConfig)}
              isLoading={isLoading}
              errorMessage={loginError}
            />
          ) : null}
          {screen === "home" ? (
            <HomeScreen
              creditBalanceMinutes={creditBalanceMinutes}
              hasResume={resumes.length > 0}
              onStartPractice={handleStartPracticeFromHome}
              onAddCredits={() => navigateTo("billing")}
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
              onStart={handleStartPracticeFromHome}
              onDelete={handleDeleteResume}
              onSelect={setSelectedResumeId}
              onUpload={handleUploadResume}
              onClearError={() => setResumeError(null)}
              isLoading={isResumeLoading}
              errorMessage={resumeError}
            />
          ) : null}
          {screen === "session" ? (
            <SessionScreen
              resumeId={resumes.some((resume) => resume.id === selectedResumeId) ? selectedResumeId : null}
              resumeFileName={resumes.find((resume) => resume.id === selectedResumeId)?.fileName ?? null}
              onFinish={(reflection) => {
                setLatestReflection(
                  reflection
                    ? {
                        strengths: reflection.strengths,
                        improvements: reflection.improvements,
                        advice: reflection.advice,
                      }
                    : null,
                );
                navigateTo("reflection");
              }}
              onBilling={() => navigateTo("billing")}
            />
          ) : null}
          {screen === "reflection" ? (
            <ReflectionScreen
              reflection={latestReflection}
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
              isLoading={isBillingLoading}
              errorMessage={billingError}
            />
          ) : null}
        </section>
        {isStartWithoutResumeDialogOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section
              className="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="start-without-resume-title"
            >
              <p className="screen-label">Confirm</p>
              <h2 id="start-without-resume-title">職務経歴書なしで始めますか？</h2>
              <p>
                このまま始めることもできます。職務経歴書を追加すると、内容に合わせた質問で練習しやすくなります。
              </p>
              <div className="actions dialog-actions">
                <button className="secondary-button" onClick={handleAddResumeFromStartDialog}>
                  職務経歴書を追加する
                </button>
                <button className="primary-button" onClick={handleStartPracticeWithoutResume}>
                  このまま始める
                </button>
              </div>
              <button
                className="dialog-close-button"
                onClick={() => setIsStartWithoutResumeDialogOpen(false)}
                aria-label="確認を閉じる"
              >
                ×
              </button>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
