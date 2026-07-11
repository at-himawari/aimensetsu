import { useEffect, useRef, useState } from "react";

import { BillingScreen } from "./screens/BillingScreen";
import { HistoryListScreen } from "./screens/HistoryListScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { PhoneSetupScreen } from "./screens/PhoneSetupScreen";
import { ReflectionScreen } from "./screens/ReflectionScreen";
import { ResumeScreen } from "./screens/ResumeScreen";
import { SessionScreen } from "./screens/SessionScreen";
import type { ScreenKey } from "./screens/types";
import {
  confirmForgotPasswordWithCognito,
  confirmSignUpWithCognito,
  exchangeCognitoCode,
  forgotPasswordWithCognito,
  getCognitoUser,
  getCognitoConfig,
  loginWithCognitoPassword,
  readCognitoCallback,
  resendConfirmationCodeWithCognito,
  signUpWithCognito,
  updateCognitoPhoneNumber,
  verifyCognitoPhoneNumber,
  type CognitoCodeDeliveryDetails,
} from "./lib/auth/cognito";
import { initializeAnalytics, trackEvent, trackScreenView } from "./lib/analytics/ga4";
import { ApiError, createApiClient, getConfiguredApiBaseUrl, type InterviewMessage, type InterviewSession, type Reflection, type ResumeFile } from "./lib/api/client";
import { useAuth, type AuthState } from "./state/auth";
import { LoadingState } from "./ui/LoadingState";


const apiClient = createApiClient({
  baseUrl: getConfiguredApiBaseUrl(),
});
const authMode = import.meta.env.MODE === "test" || import.meta.env.VITE_AUTH_MODE !== "cognito" ? "demo" : "cognito";
const cognitoConfig = getCognitoConfig();

export function isAuthenticatedForMode(authState: AuthState, mode: "demo" | "cognito") {
  if (mode === "cognito") {
    return authState.mode === "jwt" && Boolean(authState.accessToken);
  }
  return authState.mode === "demo"
    ? Boolean(authState.demoUserId)
    : authState.mode === "jwt"
      ? Boolean(authState.accessToken)
      : false;
}

function isAuthenticatedAuthState(authState: AuthState) {
  return isAuthenticatedForMode(authState, authMode);
}

type HistoryItem = {
  id: string;
  title: string;
  previewTitle: string;
  previewMeta: string;
  transcript: string[];
  reflection: {
    strengths: string[];
    improvements: string[];
    advice: string;
  };
};

function formatSessionDateLabel(session: InterviewSession) {
  const startedAt = new Date(session.started_at);
  return Number.isNaN(startedAt.getTime())
    ? session.started_at
    : startedAt.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
}

function formatHistoryTitle(session: InterviewSession) {
  const dateLabel = formatSessionDateLabel(session);
  const roleLabel = session.job_role || session.mode || "面接練習";

  return `${dateLabel} ${roleLabel}`;
}

function formatHistoryPreviewMeta(session: InterviewSession) {
  const dateLabel = formatSessionDateLabel(session);
  if (typeof session.consumed_minutes === "number" && session.consumed_minutes > 0) {
    return `${dateLabel} ${session.consumed_minutes}分`;
  }
  return dateLabel;
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
  const previewTitle = session.job_role || session.mode || "面接練習";

  return {
    id: session.session_id,
    title: formatHistoryTitle(session),
    previewTitle,
    previewMeta: formatHistoryPreviewMeta(session),
    transcript: mapMessagesToTranscript(messages),
    reflection: mapReflection(reflection),
  };
}

const initialHistoryItems: HistoryItem[] = [
  {
    id: "history_1",
    title: "2026-04-24 Backend Engineer 模擬面接",
    previewTitle: "Backend Engineer 模擬面接",
    previewMeta: "2026/04/24 26分",
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
    previewTitle: "自己紹介集中練習",
    previewMeta: "2026/04/23 18分",
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

type LandingIconName =
  | "sparkle"
  | "resume"
  | "voice"
  | "feedback"
  | "history"
  | "credit"
  | "device"
  | "home"
  | "practice"
  | "shield"
  | "lock"
  | "payment";

function LandingIcon({ name }: { name: LandingIconName }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  };

  return (
    <svg {...commonProps}>
      {name === "sparkle" ? (
        <>
          <path d="M12 3.75 13.95 9 19.25 11 13.95 13 12 18.25 10.05 13 4.75 11 10.05 9 12 3.75Z" />
          <path d="M18.2 4.8 18.85 6.35 20.4 7 18.85 7.65 18.2 9.2 17.55 7.65 16 7 17.55 6.35 18.2 4.8Z" />
        </>
      ) : null}
      {name === "resume" ? (
        <>
          <path d="M7 3.75h6.25L17 7.5v12.75H7V3.75Z" />
          <path d="M13 3.75V7.5h4" />
          <path d="M9.4 11h5.2M9.4 14h5.2M9.4 17h3.2" />
        </>
      ) : null}
      {name === "voice" ? (
        <>
          <path d="M12 4.25a3 3 0 0 0-3 3v4.25a3 3 0 0 0 6 0V7.25a3 3 0 0 0-3-3Z" />
          <path d="M6.75 10.75v.75a5.25 5.25 0 0 0 10.5 0v-.75M12 16.75v3M9.25 19.75h5.5" />
        </>
      ) : null}
      {name === "feedback" ? (
        <>
          <path d="M5.25 5.25h13.5v9.5H12l-4.25 4v-4h-2.5v-9.5Z" />
          <path d="m9 10.1 1.9 1.9L15.25 8" />
        </>
      ) : null}
      {name === "history" ? (
        <>
          <path d="M5.25 12a6.75 6.75 0 1 0 2-4.8" />
          <path d="M5.25 6.25v3.5h3.5M12 8.25v4l2.65 1.55" />
        </>
      ) : null}
      {name === "credit" ? (
        <>
          <path d="M4.75 7.25h14.5v9.5H4.75v-9.5Z" />
          <path d="M4.75 10h14.5M8 14h2.25M13.25 14h2.75" />
        </>
      ) : null}
      {name === "device" ? (
        <>
          <path d="M4.75 6.25h10.5v8H4.75v-8ZM8.5 18.25h3M10 14.25v4" />
          <path d="M17 9.25h2.25v9H17v-9Z" />
        </>
      ) : null}
      {name === "home" ? (
        <>
          <path d="m4.75 11 7.25-6 7.25 6" />
          <path d="M7 10.25v8h10v-8" />
          <path d="M10 18.25v-4h4v4" />
        </>
      ) : null}
      {name === "practice" ? (
        <>
          <path d="M6.25 6.5h11.5v8H9.5l-3.25 3v-11Z" />
          <path d="M9 9.5h6M9 12h4.25" />
        </>
      ) : null}
      {name === "shield" ? (
        <>
          <path d="M12 3.75 18.25 6v5.25c0 4-2.55 7.35-6.25 9-3.7-1.65-6.25-5-6.25-9V6L12 3.75Z" />
          <path d="m9.25 12.1 1.85 1.85 3.85-4" />
        </>
      ) : null}
      {name === "lock" ? (
        <>
          <path d="M6.5 10.5h11v8.25h-11V10.5Z" />
          <path d="M8.75 10.5V8.25a3.25 3.25 0 0 1 6.5 0v2.25" />
          <path d="M12 14v1.5" />
        </>
      ) : null}
      {name === "payment" ? (
        <>
          <path d="M4.75 7.5h14.5v9H4.75v-9Z" />
          <path d="M4.75 10h14.5" />
          <path d="M8 14h3M14.5 14h1.5" />
        </>
      ) : null}
    </svg>
  );
}

const heroBenefits: Array<{ icon: LandingIconName; label: string }> = [
  { icon: "resume", label: "あなたの経歴から最適な質問を生成" },
  { icon: "voice", label: "音声でリアルな面接練習を実現" },
  { icon: "feedback", label: "AIのフィードバックで着実にレベルアップ" },
];

function ProductPreview() {
  return (
    <section className="product-preview" aria-label="面接練習画面のプレビュー">
      <div className="preview-window">
        <div className="preview-window-header">
          <strong>面接練習中</strong>
          <div className="preview-window-actions" aria-hidden="true">
            <span>残り時間 24:36</span>
            <span>練習を終了</span>
          </div>
        </div>
        <div className="preview-layout">
          <div className="preview-main">
            <div className="preview-message">
              <span className="preview-avatar">AI</span>
              <p>これまでのご経験の中で、最も成果を上げたプロジェクトについて教えてください。</p>
            </div>
            <div className="preview-answer">
              <strong>あなたの回答</strong>
              <span />
              <span />
              <span />
            </div>
            <div className="preview-thinking">
              <span aria-hidden="true"><LandingIcon name="feedback" /></span>
              AIが考えています...
            </div>
            <div className="preview-mic">
              <span aria-hidden="true"><LandingIcon name="voice" /></span>
              <strong>クリックして話す</strong>
              <small>AI応答中は自動でミュートになります</small>
            </div>
          </div>
          <aside className="preview-log">
            <strong>対話ログ</strong>
            <p>AI面接官</p>
            <span>これまでのご経験の中で...</span>
            <p>あなた</p>
            <span>音声で回答中</span>
            <p>AI面接官</p>
            <span>その取り組みの中で難しかった点は...</span>
          </aside>
        </div>
      </div>
    </section>
  );
}

const featureCards: Array<{ icon: LandingIconName; title: string; body: string }> = [
  { icon: "resume", title: "職務経歴書をもとにパーソナライズ質問", body: "あなたの経歴情報をAIが分析し、企業・職種に合わせた質問を生成。" },
  { icon: "voice", title: "リアルな音声対話", body: "マイクを使った自然な会話で、本番に近い練習が可能。" },
  { icon: "feedback", title: "AIによる振り返り", body: "良かった点・改善点・次回アドバイスをAIが客観的にフィードバック。" },
  { icon: "history", title: "練習履歴の管理", body: "すべての面接履歴を保存し、振り返りや前回の把握に役立ちます。" },
];

const workflowSteps = [
  ["1", "職務経歴書を登録", "PDFをアップロードすると、AIが内容を解析・保存します。"],
  ["2", "面接練習を開始", "あなたの経歴に合わせた質問で練習をスタート。"],
  ["3", "AIと音声で対話", "マイクを使って回答。AIがリアルタイムで応答。"],
  ["4", "振り返りを確認", "良かった点・改善点・次のアクションを確認。"],
  ["5", "次の面接に活かす", "改善を重ねて、自信を持って本番に臨みましょう。"],
];

const authenticatedSidebarItems: Array<{
  icon: LandingIconName;
  label: string;
  isActive: (screen: ScreenKey) => boolean;
  onSelect: ScreenKey;
}> = [
  { icon: "home", label: "ホーム", isActive: (screen) => screen === "home", onSelect: "home" },
  { icon: "resume", label: "職務経歴書", isActive: (screen) => screen === "resume", onSelect: "resume" },
  { icon: "history", label: "履歴", isActive: (screen) => screen === "history" || screen === "reflection", onSelect: "history" },
  { icon: "credit", label: "クレジット・課金", isActive: (screen) => screen === "billing", onSelect: "billing" },
];

function HomeDashboardPreview() {
  return (
    <section className="dashboard-preview" aria-label="ホーム画面のプレビュー">
      <aside>
        <strong><img className="dashboard-brand-logo" src="/favicon.png" alt="" aria-hidden="true" />AI面接コーチ</strong>
        <span><LandingIcon name="home" />ホーム</span>
        <span><LandingIcon name="practice" />面接練習</span>
        <span><LandingIcon name="history" />履歴</span>
        <span><LandingIcon name="resume" />職務経歴書</span>
        <span><LandingIcon name="credit" />クレジット・課金</span>
      </aside>
      <div className="dashboard-main">
        <h3>ホーム</h3>
        <div className="dashboard-panels">
          <section>
            <strong>面接練習を開始する</strong>
            <p>職務経歴書に基づいた質問で、AI面接官と練習しましょう。</p>
            <span>新しい面接練習を始める</span>
          </section>
          <section>
            <strong>残り練習時間</strong>
            <p><b>60</b> 分</p>
          </section>
          <section>
            <strong>職務経歴書が未登録です</strong>
            <p>より精度の高い質問生成のために、職務経歴書を登録してください。</p>
          </section>
          <section>
            <strong>最近の履歴</strong>
            <p>総合職_面接練習 26分</p>
            <p>マーケター職_想定面接 18分</p>
          </section>
        </div>
      </div>
    </section>
  );
}

function LandingSections() {
  return (
    <>
      <section className="landing-band feature-band" id="features">
        <div className="landing-section-inner feature-layout">
          <div>
            <h2>すべてが、面接力の向上につながる</h2>
            <div className="feature-grid">
              {featureCards.map(({ icon, title, body }) => (
                <article className="feature-card" key={title}>
                  <span aria-hidden="true"><LandingIcon name={icon} /></span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
          <HomeDashboardPreview />
        </div>
      </section>
      <section className="landing-band workflow-band" id="how-to-use">
        <div className="landing-section-inner">
          <h2>使い方はシンプル、効果は本格的</h2>
          <div className="workflow-grid">
            {workflowSteps.map(([number, title, body]) => (
              <article className="workflow-step" key={title}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="landing-band product-band">
        <div className="landing-section-inner product-cards">
          <article>
            <h3>職務経歴書管理</h3>
            <div className="mini-file-list">
              <span>職務経歴書_2024.pdf</span>
              <span>職務経歴書_エンジニア.pdf</span>
            </div>
            <p>ファイルはAmazon Web Services上で安全に保存され、テキストを自動で抽出・解析します。</p>
          </article>
          <article>
            <h3>面接練習画面</h3>
            <div className="mini-dialog">
              <strong>AI面接官</strong>
              <p>あなたがチームで意見が対立した際、どのように合意形成を図りましたか?</p>
            </div>
            <p>AIの発話中は自動でミュート。集中できる録音体験を提供します。</p>
          </article>
          <article>
            <h3>振り返りレポート</h3>
            <div className="mini-score">
              <strong>78</strong>
              <span>/ 100</span>
            </div>
            <p>AIが多角的に評価し、次につながる具体的な改善アドバイスを提示。</p>
          </article>
          <article>
            <h3>履歴詳細</h3>
            <div className="mini-dialog">
              <strong>総合職_面接練習</strong>
              <p>会話ログと振り返りをいつでも確認できます。</p>
            </div>
            <p>弱点の把握と改善に役立ちます。</p>
          </article>
        </div>
      </section>
      <section className="landing-band pricing-band" id="pricing">
        <div className="landing-section-inner pricing-layout">
          <div className="pricing-panel">
            <h2>シンプルな料金体系</h2>
            <div className="pricing-cards">
              <article>
                <span>初回無料お試し</span>
                <strong>無料で30分</strong>
                <p>登録後すぐに面接練習を始められます。</p>
              </article>
              <article>
                <span>通常プラン</span>
                <strong>30分 300円</strong>
                <p>必要な分だけ追加できます。</p>
              </article>
            </div>
          </div>
          <div className="security-panel">
            <h2>安心・安全の仕組み</h2>
            <div>
              <span><LandingIcon name="shield" />Amazon Web Servicesで安全に本人確認</span>
              <span><LandingIcon name="lock" />データは暗号化して安全な環境に保存</span>
              <span><LandingIcon name="payment" />決済情報は安全な決済基盤で保護</span>
            </div>
          </div>
          <div className="final-cta">
            <h2>まずは無料で体験してみませんか?</h2>
            <p>初回30分の無料体験から、すぐに面接練習を始められます。</p>
            <a href="#account">無料で始める</a>
          </div>
        </div>
      </section>
    </>
  );
}


export default function App() {
  const { authState, loginDemo, setJwt, logout } = useAuth();
  const isLoggedIn = isAuthenticatedAuthState(authState);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [phoneSetupError, setPhoneSetupError] = useState<string | null>(null);
  const [isPhoneSetupCodeSent, setIsPhoneSetupCodeSent] = useState(false);
  const [screen, setScreen] = useState<ScreenKey>("login");
  const [creditBalanceMinutes, setCreditBalanceMinutes] = useState(30);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [resumes, setResumes] = useState<ResumeItem[]>([...initialResumes]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(initialResumes[0]?.id ?? null);
  const [isResumeLoading, setIsResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>("");
  const [latestReflection, setLatestReflection] = useState<HistoryItem["reflection"] | null>(null);
  const [isStartWithoutResumeDialogOpen, setIsStartWithoutResumeDialogOpen] = useState(false);
  const lastTrackedScreenRef = useRef<ScreenKey | null>(null);

  const selectedHistory =
    historyItems.find((item) => item.id === selectedHistoryId) ?? historyItems[0] ?? null;

  useEffect(() => {
    initializeAnalytics();
  }, []);

  useEffect(() => {
    if (lastTrackedScreenRef.current === screen) {
      return;
    }
    lastTrackedScreenRef.current = screen;
    trackScreenView(screen);
  }, [screen]);

  useEffect(() => {
    if (authMode === "cognito" && authState.mode === "demo") {
      logout();
      return;
    }

    if (!isLoggedIn && screen !== "login") {
      setIsStartWithoutResumeDialogOpen(false);
      setScreen("login");
    }
  }, [authState.mode, isLoggedIn, logout, screen]);

  const completeLogin = async (nextAuthState: AuthState) => {
    if (authMode === "cognito" && cognitoConfig && nextAuthState.mode === "jwt" && nextAuthState.accessToken) {
      const userAttributes = await getCognitoUser(cognitoConfig, nextAuthState.accessToken);
      if (userAttributes.phone_number_verified !== "true") {
        setPhoneSetupError(null);
        setIsPhoneSetupCodeSent(false);
        setScreen("phone-setup");
        return;
      }
    }
    await Promise.all([
      loadResumes(nextAuthState),
      loadCreditBalance(nextAuthState),
      loadHistory(nextAuthState),
    ]);
    setScreen("home");
  };

  const loadCreditBalance = async (nextAuthState: AuthState = authState) => {
    if (!isAuthenticatedAuthState(nextAuthState)) {
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
        trackEvent("login", { method: "cognito_hosted_ui" });
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
    if (!isAuthenticatedAuthState(authState)) {
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
        if (confirmedMinutes !== null && checkoutSessionId) {
          const storageKey = `ga4_purchase_${checkoutSessionId}`;
          if (window.sessionStorage.getItem(storageKey) !== "1") {
            trackEvent("purchase", {
              transaction_id: checkoutSessionId,
              value: 300,
              currency: "JPY",
              items: [
                {
                  item_id: "minutes_30",
                  item_name: "30分追加パック",
                  price: 300,
                  quantity: 1,
                },
              ],
            });
            window.sessionStorage.setItem(storageKey, "1");
          }
        }
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

  const loadHistoryDetail = async (historyId: string, nextAuthState: AuthState = authState) => {
    if (!isAuthenticatedAuthState(nextAuthState)) {
      return;
    }

    try {
      const response = await apiClient.getHistoryDetail(nextAuthState, historyId);
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

  const loadHistory = async (nextAuthState: AuthState = authState) => {
    if (!isAuthenticatedAuthState(nextAuthState)) {
      return;
    }

    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await apiClient.getHistory(nextAuthState);
      const nextItems = response.data.map((session) => mapSessionToHistoryItem(session));
      setHistoryItems(nextItems);

      const nextSelectedId = nextItems[0]?.id ?? "";
      setSelectedHistoryId(nextSelectedId);
      if (nextSelectedId) {
        await loadHistoryDetail(nextSelectedId, nextAuthState);
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "履歴を取得できませんでした。";
      setHistoryError(message);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const loadResumes = async (nextAuthState: AuthState = authState) => {
    if (!isAuthenticatedAuthState(nextAuthState)) {
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
    trackEvent("select_content", {
      content_type: "history",
      item_id: historyId,
    });
    void loadHistoryDetail(historyId);
  };

  const handleDeleteHistory = async () => {
    if (!selectedHistoryId) {
      return;
    }

    if (isAuthenticatedAuthState(authState)) {
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
    trackEvent("delete_history", {
      history_count_after_delete: Math.max(historyItems.length - 1, 0),
    });
  };

  const navigateTo = (nextScreen: ScreenKey) => {
    setScreen(nextScreen);
    if (nextScreen === "home" || nextScreen === "billing") {
      void loadCreditBalance();
    }
    if (nextScreen === "home" || nextScreen === "history") {
      void loadHistory();
    }
    if (nextScreen === "resume") {
      void loadResumes();
    }
  };

  const handleUploadResume = async (file: File) => {
    if (!isAuthenticatedAuthState(authState)) {
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
      trackEvent("resume_upload", {
        file_extension: "pdf",
        file_size_bytes: file.size,
        resume_count_after_upload: resumes.length + 1,
        has_extracted_text: nextResume.hasExtractedText ?? false,
      });
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
    if (isAuthenticatedAuthState(authState)) {
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
    trackEvent("resume_delete", {
      resume_count_after_delete: Math.max(resumes.length - 1, 0),
    });
  };

  const handlePurchaseCredits = async () => {
    if (!isAuthenticatedAuthState(authState)) {
      setBillingError("ログイン後に購入できます。");
      return;
    }

    setIsBillingLoading(true);
    setBillingError(null);
    try {
      trackEvent("begin_checkout", {
        currency: "JPY",
        value: 300,
        items: [
          {
            item_id: "minutes_30",
            item_name: "30分追加パック",
            price: 300,
            quantity: 1,
          },
        ],
      });
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
      trackEvent("start_interview_prompt_without_resume", {
        credit_balance_minutes: creditBalanceMinutes,
      });
      return;
    }
    setScreen("session");
    trackEvent("start_interview", {
      source: screen,
      has_resume: true,
      credit_balance_minutes: creditBalanceMinutes,
    });
  };

  const handleStartPracticeWithoutResume = () => {
    setSelectedResumeId(null);
    setIsStartWithoutResumeDialogOpen(false);
    setScreen("session");
    trackEvent("start_interview", {
      source: "without_resume_dialog",
      has_resume: false,
      credit_balance_minutes: creditBalanceMinutes,
    });
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
      trackEvent("login", { method: "demo" });
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
      trackEvent("login", { method: "cognito_password" });
      await completeLogin(nextAuthState);
    } catch (error) {
      const message = error instanceof Error ? error.message : "ログインに失敗しました。";
      setLoginError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (payload: { email: string; password: string; name?: string }): Promise<CognitoCodeDeliveryDetails | undefined> => {
    if (!cognitoConfig) {
      setLoginError("ログイン設定が不足しています。");
      return undefined;
    }

    setIsLoading(true);
    setLoginError(null);
    try {
      const response = await signUpWithCognito(cognitoConfig, payload);
      trackEvent("sign_up", { method: "cognito_password" });
      return response.CodeDeliveryDetails;
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

  const handleResendConfirmationCode = async (payload: { email: string }): Promise<CognitoCodeDeliveryDetails | undefined> => {
    if (!cognitoConfig) {
      setLoginError("ログイン設定が不足しています。");
      return undefined;
    }

    setIsLoading(true);
    setLoginError(null);
    try {
      const response = await resendConfirmationCodeWithCognito(cognitoConfig, payload);
      return response.CodeDeliveryDetails;
    } catch (error) {
      const message = error instanceof Error ? error.message : "確認コードの再送に失敗しました。";
      setLoginError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (payload: { email: string }): Promise<CognitoCodeDeliveryDetails | undefined> => {
    if (!cognitoConfig) {
      setLoginError("ログイン設定が不足しています。");
      return undefined;
    }

    setIsLoading(true);
    setLoginError(null);
    try {
      const response = await forgotPasswordWithCognito(cognitoConfig, payload);
      return response.CodeDeliveryDetails;
    } catch (error) {
      const message = error instanceof Error ? error.message : "パスワード再設定コードの送信に失敗しました。";
      setLoginError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmForgotPassword = async (payload: { email: string; code: string; newPassword: string; phoneNumber: string }) => {
    if (!cognitoConfig) {
      setLoginError("ログイン設定が不足しています。");
      return;
    }

    setIsLoading(true);
    setLoginError(null);
    try {
      await confirmForgotPasswordWithCognito(cognitoConfig, payload);
      const tokenResponse = await loginWithCognitoPassword(cognitoConfig, {
        email: payload.email,
        password: payload.newPassword,
      });
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
      await apiClient.preparePhoneNumberUpdate(nextAuthState, payload.phoneNumber);
      await updateCognitoPhoneNumber(cognitoConfig, {
        accessToken: token,
        phoneNumber: payload.phoneNumber,
      });
      setIsPhoneSetupCodeSent(true);
      setPhoneSetupError(null);
      setScreen("phone-setup");
      trackEvent("phone_verification_code_sent", { source: "password_reset" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "パスワードの再設定に失敗しました。";
      setLoginError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPhoneCode = async (phoneNumber: string) => {
    if (!cognitoConfig || authState.mode !== "jwt" || !authState.accessToken) {
      setPhoneSetupError("ログイン情報を確認できませんでした。もう一度ログインしてください。");
      return;
    }

    setIsLoading(true);
    setPhoneSetupError(null);
    try {
      await apiClient.preparePhoneNumberUpdate(authState, phoneNumber);
      await updateCognitoPhoneNumber(cognitoConfig, {
        accessToken: authState.accessToken,
        phoneNumber,
      });
      setIsPhoneSetupCodeSent(true);
      trackEvent("phone_verification_code_sent", { source: "phone_setup" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "確認コードの送信に失敗しました。";
      setPhoneSetupError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPhoneCode = async (code: string) => {
    if (!cognitoConfig || authState.mode !== "jwt" || !authState.accessToken) {
      setPhoneSetupError("ログイン情報を確認できませんでした。もう一度ログインしてください。");
      return;
    }

    setIsLoading(true);
    setPhoneSetupError(null);
    try {
      await verifyCognitoPhoneNumber(cognitoConfig, {
        accessToken: authState.accessToken,
        code,
      });
      trackEvent("phone_verified");
      await completeLogin(authState);
    } catch (error) {
      const message = error instanceof Error ? error.message : "電話番号の確認に失敗しました。";
      setPhoneSetupError(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    setScreen("login");
    trackEvent("logout");
  };

  const shouldShowAuthenticatedChrome = isLoggedIn && screen !== "phone-setup";
  const pageClassName = screen === "session"
    ? "page-shell session-page"
    : screen === "login"
      ? "landing-page"
      : screen === "phone-setup"
        ? "page-shell login-page"
        : "page-shell app-page";

  return (
    <main className={pageClassName}>
      {screen === "login" ? (
        <>
          <section className="landing-hero" id="top">
            <header className="landing-header">
              <a className="brand-mark" href="#top" aria-label="AI面接コーチ ホーム">
                <span className="brand-logo-image" aria-hidden="true"><img src="/favicon.png" alt="" /></span>
                AI面接コーチ
              </a>
              <nav aria-label="主要ナビゲーション">
                <a href="#features">機能</a>
                <a href="#pricing">料金</a>
                <a href="#how-to-use">使い方</a>
                <a href="#account">よくある質問</a>
              </nav>
              <div className="landing-header-actions">
                <a className="ghost-header-button" href="#account">ログイン</a>
                <a className="header-cta-button" href="#account">無料で始める</a>
              </div>
            </header>
            <div className="landing-hero-grid">
              <section className="landing-copy" aria-labelledby="landing-title">
                <h1 id="landing-title">AIと、想定を超える<span className="nowrap-phrase">面接力を。</span></h1>
                <p>一般的な質問ではなく、経歴・担当業務・実績に合わせて質問します。</p>
                <div className="hero-benefits">
                  {heroBenefits.map(({ icon, label }) => (
                    <span key={label}>
                      <i aria-hidden="true"><LandingIcon name={icon} /></i>
                      {label}
                    </span>
                  ))}
                </div>
                <div className="hero-actions">
                  {authMode === "demo" ? (
                    <button className="primary-button hero-primary-link" onClick={handleDemoLogin} disabled={isLoading}>
                      {isLoading ? "開始中" : "無料で始める"}
                    </button>
                  ) : (
                    <a className="primary-button hero-primary-link" href="#account">無料で始める</a>
                  )}
                  <a className="secondary-button hero-secondary-link" href="#account">ログイン</a>
                </div>
              </section>
              <ProductPreview />
            </div>
          </section>
          <LandingSections />
          <section className="landing-band account-band" id="account">
            <div className="landing-section-inner account-layout">
              <div>
                <p className="eyebrow">Account</p>
                <h2>すぐに練習を始める</h2>
                <p>登録済みの方はログインしてください。初めての方は無料体験からすぐに面接練習を始められます。</p>
              </div>
              <LoginScreen
                onDemoLogin={handleDemoLogin}
                onPasswordLogin={handlePasswordLogin}
                onSignUp={handleSignUp}
                onConfirmSignUp={handleConfirmSignUp}
                onResendConfirmationCode={handleResendConfirmationCode}
                onForgotPassword={handleForgotPassword}
                onConfirmForgotPassword={handleConfirmForgotPassword}
                authMode={authMode}
                isCognitoConfigured={Boolean(cognitoConfig)}
                isLoading={isLoading}
                errorMessage={loginError}
                demoLoginLabel="無料体験を始める"
              />
            </div>
          </section>
          {isLoading ? (
            <div className="landing-loading">
              <LoadingState
                title="読み込み中"
                body="少し時間がかかる場合があります。画面はそのままでお待ちください。"
              />
            </div>
          ) : null}
        </>
      ) : null}
      {screen !== "login" ? (
      <section className="hero-card">
        <p className="eyebrow">Interview Practice</p>
        <h1>AI面接コーチ</h1>
        <p className="lead">本番前に、納得いくまで面接練習を重ねられます。</p>

        {isLoading ? (
          <LoadingState
            title="読み込み中"
            body="少し時間がかかる場合があります。画面はそのままでお待ちください。"
          />
        ) : null}

        <section className="app-auth-layout">
          {shouldShowAuthenticatedChrome ? (
            <aside className="app-sidebar" aria-label="アプリメニュー">
              <strong className="app-sidebar-brand">
                <img className="app-sidebar-brand-logo" src="/favicon.png" alt="" aria-hidden="true" />
                <span>AI面接コーチ</span>
              </strong>
              {authenticatedSidebarItems.map(({ icon, label, isActive, onSelect }) => (
                <button
                  key={label}
                  className={isActive(screen) ? "app-sidebar-item active" : "app-sidebar-item"}
                  type="button"
                  onClick={() => navigateTo(onSelect)}
                >
                  <span aria-hidden="true" className="app-sidebar-item-icon">
                    <LandingIcon name={icon} />
                  </span>
                  <span>{label}</span>
                </button>
              ))}
              <button className="app-sidebar-item app-sidebar-logout" type="button" onClick={handleLogout}>
                ログアウト
              </button>
            </aside>
          ) : null}

        <section className="screen-shell">
          {screen === "phone-setup" ? (
            <PhoneSetupScreen
              onSendCode={handleSendPhoneCode}
              onVerifyCode={handleVerifyPhoneCode}
              onEditPhoneNumber={() => {
                setIsPhoneSetupCodeSent(false);
                setPhoneSetupError(null);
              }}
              onLogout={handleLogout}
              initialCodeSent={isPhoneSetupCodeSent}
              initialMessage={isPhoneSetupCodeSent ? "SMSで確認コードを送信しました。" : null}
              isLoading={isLoading}
              errorMessage={phoneSetupError}
            />
          ) : null}
          {screen === "home" ? (
            <HomeScreen
              creditBalanceMinutes={creditBalanceMinutes}
              hasResume={resumes.length > 0}
              recentHistoryItems={historyItems}
              isHistoryLoading={isHistoryLoading}
              onStartPractice={handleStartPracticeFromHome}
              onAddCredits={() => navigateTo("billing")}
              onMove={(nextScreen) => {
                navigateTo(nextScreen);
              }}
              onOpenHistory={handleOpenHistoryDetail}
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
                trackEvent("finish_interview", {
                  has_resume: Boolean(selectedResumeId),
                  has_reflection: Boolean(reflection),
                });
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
      ) : null}
      <footer className="app-footer" aria-label="Copyright">
        ©︎ 2026 Himawari Project
      </footer>
    </main>
  );
}
