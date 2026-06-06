import type { ScreenKey } from "../../screens/types";

type GtagCommand = "config" | "event" | "js" | "set";

type Gtag = (
  command: GtagCommand,
  targetId: string | Date,
  config?: Record<string, unknown>,
) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

function findMeasurementId() {
  const script = document.querySelector<HTMLScriptElement>("script[src*='googletagmanager.com/gtag/js']");
  const id = script ? new URL(script.src).searchParams.get("id") : null;
  return id?.trim() ?? "";
}

const measurementId = findMeasurementId();
const isAnalyticsEnabled = import.meta.env.MODE !== "test" && measurementId.length > 0;
let isInitialized = false;

const screenTitles: Record<ScreenKey, string> = {
  login: "ログイン",
  "phone-setup": "電話番号確認",
  home: "ホーム",
  resume: "職務経歴書",
  session: "面接練習",
  reflection: "振り返り",
  history: "履歴",
  billing: "練習時間追加",
};

function appendGtagScript(id: string) {
  if (document.querySelector(`script[data-ga4-measurement-id="${id}"]`)) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.dataset.ga4MeasurementId = id;
  document.head.appendChild(script);
}

export function initializeAnalytics() {
  if (!isAnalyticsEnabled || isInitialized) {
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? function gtag(...args) {
    window.dataLayer?.push(args);
  };
  appendGtagScript(measurementId);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
  });
  isInitialized = true;
}

export function trackScreenView(screen: ScreenKey) {
  if (!isAnalyticsEnabled) {
    return;
  }

  initializeAnalytics();
  window.gtag?.("event", "page_view", {
    page_title: screenTitles[screen],
    page_location: `${window.location.origin}${window.location.pathname}#${screen}`,
    page_path: `/${screen}`,
    screen_name: screen,
  });
}

export function trackEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (!isAnalyticsEnabled) {
    return;
  }

  initializeAnalytics();
  window.gtag?.("event", eventName, params);
}
