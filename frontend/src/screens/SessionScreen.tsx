import { useEffect, useRef, useState } from "react";

import { buildApiUrl } from "../lib/api/client";
import { useAuth } from "../state/auth";
import { LoadingState } from "../ui/LoadingState";


type SessionScreenProps = {
  resumeId: string | null;
  resumeFileName?: string | null;
  onFinish: (reflection?: SessionReflection | null) => void;
  onBilling: () => void;
};

type RealtimeStatus = "idle" | "starting" | "connected" | "error";

type SessionCreateResponse = {
  data: {
    session_id: string;
  };
};

type SessionReflection = {
  strengths: string[];
  improvements: string[];
  advice: string;
};

type ConversationLogEntry = {
  id: string;
  speaker: "user" | "assistant";
  content: string;
  isPartial?: boolean;
};

function SessionMicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4.25a3 3 0 0 0-3 3v4.25a3 3 0 0 0 6 0V7.25a3 3 0 0 0-3-3Z" />
      <path d="M6.75 10.75v.75a5.25 5.25 0 0 0 10.5 0v-.75M12 16.75v3M9.25 19.75h5.5" />
    </svg>
  );
}

function SessionThinkingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.25 5.25h13.5v9.5H12l-4.25 4v-4h-2.5v-9.5Z" />
      <path d="m9 10.1 1.9 1.9L15.25 8" />
    </svg>
  );
}

type RealtimeEventPayload = {
  type?: string;
  item_id?: string;
  response_id?: string;
  item_id_previous?: string;
  output_index?: number;
  content_index?: number;
  delta?: string;
  transcript?: string;
  text?: string;
  item?: {
    id?: string;
    role?: "user" | "assistant";
    content?: Array<{
      text?: string;
      transcript?: string;
    }>;
  };
};

const CLOUD_RUN_WAIT_NOTICE_DELAY_MS = 2500;
const CLOUD_RUN_WAIT_NOTICE_MESSAGE = "バックエンドを起動しています。初回アクセスでは数十秒かかる場合があります。このままお待ちください。";


export function SessionScreen({ resumeId, resumeFileName, onFinish, onBilling }: SessionScreenProps) {
  const { authState } = useAuth();
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingMessageSavesRef = useRef<Array<Promise<void>>>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const conversationLogRef = useRef<HTMLDivElement | null>(null);
  const shouldMuteDuringAssistantSpeechRef = useRef(true);
  const isAssistantSpeakingRef = useRef(false);
  const assistantSpeechFallbackTimeoutRef = useRef<number | null>(null);
  const assistantMuteReleaseTimeoutRef = useRef<number | null>(null);
  const cloudRunWaitNoticeTimeoutRef = useRef<number | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([
    "面接を開始できます。",
  ]);
  const [connectionStep, setConnectionStep] = useState("面接を開始できます。");
  const [conversationLog, setConversationLog] = useState<ConversationLogEntry[]>([]);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [shouldMuteDuringAssistantSpeech, setShouldMuteDuringAssistantSpeech] = useState(true);
  const [shouldIgnoreResume, setShouldIgnoreResume] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    setShouldIgnoreResume(false);
  }, [resumeId]);

  const appendEvent = (message: string) => {
    setEvents((currentEvents) => [message, ...currentEvents].slice(0, 6));
  };

  const updateConnectionStep = (message: string) => {
    setConnectionStep(message);
    appendEvent(message);
  };

  const clearCloudRunWaitNotice = () => {
    if (cloudRunWaitNoticeTimeoutRef.current !== null) {
      window.clearTimeout(cloudRunWaitNoticeTimeoutRef.current);
      cloudRunWaitNoticeTimeoutRef.current = null;
    }
  };

  const scheduleCloudRunWaitNotice = () => {
    clearCloudRunWaitNotice();
    cloudRunWaitNoticeTimeoutRef.current = window.setTimeout(() => {
      updateConnectionStep(CLOUD_RUN_WAIT_NOTICE_MESSAGE);
      cloudRunWaitNoticeTimeoutRef.current = null;
    }, CLOUD_RUN_WAIT_NOTICE_DELAY_MS);
  };

  useEffect(() => {
    window.requestAnimationFrame(() => {
      const logElement = conversationLogRef.current;
      if (logElement) {
        logElement.scrollTop = logElement.scrollHeight;
      }
    });
  }, [conversationLog]);

  useEffect(() => {
    shouldMuteDuringAssistantSpeechRef.current = shouldMuteDuringAssistantSpeech;
  }, [shouldMuteDuringAssistantSpeech]);

  useEffect(() => {
    return () => {
      clearCloudRunWaitNotice();
      if (assistantSpeechFallbackTimeoutRef.current !== null) {
        window.clearTimeout(assistantSpeechFallbackTimeoutRef.current);
      }
      if (assistantMuteReleaseTimeoutRef.current !== null) {
        window.clearTimeout(assistantMuteReleaseTimeoutRef.current);
      }
    };
  }, []);

  const upsertConversationLog = (
    key: string,
    speaker: ConversationLogEntry["speaker"],
    content: string,
    options: { append?: boolean; isPartial?: boolean } = {},
  ) => {
    if (!content.trim()) {
      return;
    }

    setConversationLog((currentLog) => {
      const existingIndex = currentLog.findIndex((entry) => entry.id === key);
      if (existingIndex === -1) {
        return [
          ...currentLog,
          {
            id: key,
            speaker,
            content,
            isPartial: options.isPartial,
          },
        ].slice(-20);
      }

      return currentLog.map((entry, index) => {
        if (index !== existingIndex) {
          return entry;
        }

        return {
          ...entry,
          speaker,
          content: options.append ? `${entry.content}${content}` : content,
          isPartial: options.isPartial,
        };
      });
    });
  };

  const setLocalMicrophoneEnabled = (isEnabled: boolean) => {
    const localAudioTrack = localAudioTrackRef.current;
    if (localAudioTrack && shouldMuteDuringAssistantSpeechRef.current) {
      localAudioTrack.enabled = isEnabled;
    }
  };

  const setAssistantSpeaking = (nextIsSpeaking: boolean, options: { releaseDelayMs?: number } = {}) => {
    if (assistantMuteReleaseTimeoutRef.current !== null) {
      window.clearTimeout(assistantMuteReleaseTimeoutRef.current);
      assistantMuteReleaseTimeoutRef.current = null;
    }
    isAssistantSpeakingRef.current = nextIsSpeaking;
    setIsAssistantSpeaking(nextIsSpeaking);

    if (nextIsSpeaking) {
      if (assistantSpeechFallbackTimeoutRef.current !== null) {
        window.clearTimeout(assistantSpeechFallbackTimeoutRef.current);
      }
      setLocalMicrophoneEnabled(false);
      assistantSpeechFallbackTimeoutRef.current = window.setTimeout(() => {
        setAssistantSpeaking(false, { releaseDelayMs: 2500 });
      }, 30000);
      return;
    }

    if (assistantSpeechFallbackTimeoutRef.current !== null) {
      window.clearTimeout(assistantSpeechFallbackTimeoutRef.current);
      assistantSpeechFallbackTimeoutRef.current = null;
    }

    assistantMuteReleaseTimeoutRef.current = window.setTimeout(() => {
      setLocalMicrophoneEnabled(true);
      assistantMuteReleaseTimeoutRef.current = null;
    }, options.releaseDelayMs ?? 2500);
  };

  const releaseAssistantMute = () => {
    if (isAssistantSpeakingRef.current) {
      setAssistantSpeaking(false, { releaseDelayMs: 2500 });
    } else if (assistantMuteReleaseTimeoutRef.current === null) {
      assistantMuteReleaseTimeoutRef.current = window.setTimeout(() => {
        setLocalMicrophoneEnabled(true);
        assistantMuteReleaseTimeoutRef.current = null;
      }, 2500);
    }
  };

  const handleRealtimeEvent = (data: RealtimeEventPayload) => {
    const type = data.type ?? "";

    if (
      type === "response.audio.delta" ||
      type === "response.output_audio.delta" ||
      type === "response.output_audio_transcript.delta" ||
      type === "response.audio_transcript.delta"
    ) {
      setAssistantSpeaking(true);
    }

    if (
      type === "response.audio.done" ||
      type === "response.output_audio.done" ||
      type === "response.done"
    ) {
      releaseAssistantMute();
    }

    if (type === "conversation.item.input_audio_transcription.delta" && data.delta) {
      upsertConversationLog(data.item_id ?? `user-${Date.now()}`, "user", data.delta, {
        append: true,
        isPartial: true,
      });
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed" && data.transcript) {
      upsertConversationLog(data.item_id ?? `user-${Date.now()}`, "user", data.transcript);
      void saveRealtimeMessage("user", data.transcript);
      return;
    }

    if ((type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta") && data.delta) {
      const key = [
        "assistant",
        data.response_id ?? "response",
        data.output_index ?? 0,
        data.content_index ?? 0,
      ].join("-");
      upsertConversationLog(key, "assistant", data.delta, { append: true, isPartial: true });
      return;
    }

    if ((type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") && data.transcript) {
      const key = [
        "assistant",
        data.response_id ?? "response",
        data.output_index ?? 0,
        data.content_index ?? 0,
      ].join("-");
      upsertConversationLog(key, "assistant", data.transcript);
      void saveRealtimeMessage("assistant", data.transcript);
      return;
    }

    if ((type === "response.output_text.delta" || type === "response.text.delta") && data.delta) {
      upsertConversationLog(data.response_id ?? `assistant-${Date.now()}`, "assistant", data.delta, {
        append: true,
        isPartial: true,
      });
      return;
    }

    if ((type === "response.output_text.done" || type === "response.text.done") && (data.text || data.transcript)) {
      const content = data.text ?? data.transcript ?? "";
      upsertConversationLog(data.response_id ?? `assistant-${Date.now()}`, "assistant", content);
      void saveRealtimeMessage("assistant", content);
      return;
    }

    if (type === "conversation.item.created" && data.item?.role) {
      const content = data.item.content
        ?.map((item) => item.text ?? item.transcript ?? "")
        .filter(Boolean)
        .join("\n");
      if (content) {
        upsertConversationLog(data.item.id ?? `${data.item.role}-${Date.now()}`, data.item.role, content);
      }
    }
  };

  const authHeaders = () => {
    const headers = new Headers();
    if (authState.mode === "demo" && authState.demoUserId) {
      headers.set("X-Demo-User", authState.demoUserId);
    }
    if (authState.mode === "jwt" && authState.accessToken) {
      headers.set("Authorization", `Bearer ${authState.accessToken}`);
    }
    return headers;
  };

  const saveRealtimeMessage = async (speaker: ConversationLogEntry["speaker"], content: string) => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId || !content.trim()) {
      return;
    }

    const headers = authHeaders();
    headers.set("Content-Type", "application/json");
    const savePromise = fetch(buildApiUrl(`/api/interview-sessions/${currentSessionId}/messages`), {
      method: "POST",
      headers,
      body: JSON.stringify({
        record_only: true,
        sender_type: speaker === "assistant" ? "assistant" : "user",
        message_type: "voice",
        message: content,
      }),
    }).then(() => undefined).catch(() => undefined);
    pendingMessageSavesRef.current.push(savePromise);
    savePromise.finally(() => {
      pendingMessageSavesRef.current = pendingMessageSavesRef.current.filter((promise) => promise !== savePromise);
    });
    await savePromise;
  };

  const createInterviewSession = async () => {
    const headers = authHeaders();
    headers.set("Content-Type", "application/json");

    const createSession = (nextResumeId: string | null) => fetch(buildApiUrl("/api/interview-sessions"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "voice",
        job_role: "Webアプリケーションエンジニア",
        resume_id: nextResumeId,
      }),
    });

    const requestedResumeId = shouldIgnoreResume ? null : resumeId;
    scheduleCloudRunWaitNotice();
    try {
      let response = await createSession(requestedResumeId);
      if (!response.ok && requestedResumeId) {
        const body = await response.json().catch(() => null);
        if (body?.error?.code === "NOT_FOUND") {
          setShouldIgnoreResume(true);
          updateConnectionStep("選択中の職務経歴書が見つからないため、職務経歴書なしで開始します。");
          response = await createSession(null);
        } else {
          throw new Error(body?.error?.message ?? "面接セッションを開始できませんでした。");
        }
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "面接セッションを開始できませんでした。");
      }

      const body = (await response.json()) as SessionCreateResponse;
      return body.data.session_id;
    } finally {
      clearCloudRunWaitNotice();
    }
  };

  const createRealtimeCall = async (nextSessionId: string, sdp: string) => {
    const headers = authHeaders();
    headers.set("Content-Type", "application/sdp");
    scheduleCloudRunWaitNotice();
    try {
      const response = await fetch(buildApiUrl(`/api/interview-sessions/${nextSessionId}/realtime-call`), {
        method: "POST",
        headers,
        body: sdp,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Realtime接続に失敗しました。");
      }

      return response.text();
    } finally {
      clearCloudRunWaitNotice();
    }
  };

  const generateReflection = async (currentSessionId: string) => {
    const headers = authHeaders();
    await fetch(buildApiUrl(`/api/interview-sessions/${currentSessionId}/complete`), {
      method: "POST",
      headers,
    }).catch(() => undefined);

    scheduleCloudRunWaitNotice();
    try {
      const reflectionResponse = await fetch(buildApiUrl(`/api/interview-sessions/${currentSessionId}/reflection`), {
        method: "POST",
        headers,
      }).catch(() => undefined);
      if (reflectionResponse?.ok) {
        const body = await reflectionResponse.json().catch(() => null);
        return body?.data ?? null;
      }
      return null;
    } finally {
      clearCloudRunWaitNotice();
    }
  };

  const startInterview = async () => {
    setStatus("starting");
    setErrorMessage(null);
    setConversationLog([]);
    updateConnectionStep("面接セッションを作成しています。");

    try {
      const nextSessionId = sessionId ?? (await createInterviewSession());
      setSessionId(nextSessionId);
      sessionIdRef.current = nextSessionId;

      updateConnectionStep("マイク権限を確認しています。");
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = localStream;
      localAudioTrackRef.current = localStream.getAudioTracks()[0] ?? null;
      setLocalMicrophoneEnabled(false);

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      updateConnectionStep("音声接続を準備しています。");
      localStream.getTracks().forEach((track) => {
        peer.addTrack(track, localStream);
      });

      const audio = new Audio();
      audio.autoplay = true;
      audio.onplaying = () => {
        setAssistantSpeaking(true);
      };
      audio.onpause = () => {
        releaseAssistantMute();
      };
      audio.onended = () => {
        releaseAssistantMute();
      };
      audioRef.current = audio;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        appendEvent("AI音声の受信を開始しました。");
      };

      const channel = peer.createDataChannel("oai-events");
      channel.onopen = () => {
        appendEvent("AIとのイベントチャンネルを開きました。");
        setAssistantSpeaking(true);
        channel.send(JSON.stringify({
          type: "response.create",
          response: {
            instructions: "面接官としてフォーマルに短く挨拶し、これまでの経歴を1分程度で話すよう丁寧に促してください。タメ口やカジュアルな相づちは使わないでください。",
          },
        }));
      };
      channel.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as RealtimeEventPayload;
          handleRealtimeEvent(data);
          if (data.type && !data.type.endsWith(".delta")) {
            appendEvent(`Realtime event: ${data.type}`);
          }
        } catch {
          appendEvent("Realtime event を受信しました。");
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      updateConnectionStep("AI音声セッションへ接続しています。");

      const answerSdp = await createRealtimeCall(nextSessionId, offer.sdp ?? "");
      updateConnectionStep("接続応答を受け取り、音声を開始しています。");
      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
      setStatus("connected");
      updateConnectionStep("接続完了。音声で面接練習を始められます。");
    } catch (error) {
      stopInterviewAudio();
      const message = error instanceof Error ? error.message : "面接を開始できませんでした。";
      setErrorMessage(message);
      setStatus("error");
      appendEvent(message);
    }
  };

  const stopInterviewAudio = () => {
    clearCloudRunWaitNotice();
    if (assistantSpeechFallbackTimeoutRef.current !== null) {
      window.clearTimeout(assistantSpeechFallbackTimeoutRef.current);
      assistantSpeechFallbackTimeoutRef.current = null;
    }
    if (assistantMuteReleaseTimeoutRef.current !== null) {
      window.clearTimeout(assistantMuteReleaseTimeoutRef.current);
      assistantMuteReleaseTimeoutRef.current = null;
    }
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    localAudioTrackRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    isAssistantSpeakingRef.current = false;
    setIsAssistantSpeaking(false);
    setStatus((currentStatus) => currentStatus === "connected" ? "idle" : currentStatus);
  };

  const handleFinish = async () => {
    setIsFinishing(true);
    stopInterviewAudio();
    const currentSessionId = sessionIdRef.current;
    let reflection: SessionReflection | null = null;
    try {
      if (currentSessionId) {
        await Promise.allSettled(pendingMessageSavesRef.current);
        updateConnectionStep("面接結果を保存し、振り返りを生成しています。");
        reflection = await generateReflection(currentSessionId);
      }
      onFinish(reflection);
    } finally {
      setIsFinishing(false);
    }
  };

  const isStarting = status === "starting";
  const isConnected = status === "connected";
  const shouldShowConnectionLog = import.meta.env.DEV;
  const assistantEntries = conversationLog.filter((entry) => entry.speaker === "assistant");
  const userEntries = conversationLog.filter((entry) => entry.speaker === "user");
  const latestAssistantEntry = assistantEntries[assistantEntries.length - 1] ?? null;
  const latestUserEntry = userEntries[userEntries.length - 1] ?? null;
  const promptText = latestAssistantEntry?.content ?? "";
  const userResponseText = latestUserEntry?.content ?? "";
  const shouldShowThinking = isStarting || isAssistantSpeaking || (isConnected && !latestAssistantEntry);

  return (
    <section className="screen-card session-screen-card">
      {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
      {isStarting || isFinishing ? (
        <LoadingState
          title={isFinishing ? "面接結果を処理中" : "接続準備中"}
          body={connectionStep}
        />
      ) : null}

      <div className="session-preview-window">
        <div className="session-preview-header">
          <strong>面接練習中</strong>
          <div className="session-preview-actions" aria-live="polite">
            <span>{isConnected ? "接続中" : isStarting ? "接続準備中" : "未接続"}</span>
            <button className="session-preview-end" onClick={handleFinish} disabled={isFinishing}>
              {isFinishing ? "終了処理中" : "面接を終了"}
            </button>
          </div>
        </div>

        <div className="session-preview-layout">
          <div className="session-preview-main">
            <div className="preview-message session-prompt-card">
              <span className="preview-avatar">AI</span>
              {promptText ? <p>{promptText}</p> : <p className="empty-conversation">接続後に質問が表示されます。</p>}
            </div>

            {userResponseText ? (
              <div className="preview-answer session-answer-card">
                <strong>あなたの回答</strong>
                <p className="session-answer-text">
                  {userResponseText}
                  {latestUserEntry?.isPartial ? <span className="partial-indicator">...</span> : null}
                </p>
              </div>
            ) : null}

            {shouldShowThinking ? (
              <div className="preview-thinking session-thinking-card">
                <span aria-hidden="true"><SessionThinkingIcon /></span>
                AIが考えています...
              </div>
            ) : null}

            <div className="preview-mic session-mic-card">
              <span aria-hidden="true"><SessionMicIcon /></span>
              <strong>{isConnected ? "音声で話せます" : "クリックして話す"}</strong>
              <small>{isAssistantSpeaking && shouldMuteDuringAssistantSpeech ? "AI応答中はマイクを自動で抑制中です" : "AI応答中は自動でミュートになります"}</small>
              {resumeFileName && !shouldIgnoreResume ? <p className="session-resume-note">使用レジュメ: {resumeFileName}</p> : null}
              <label className="audio-guard-toggle">
                <input
                  type="checkbox"
                  checked={shouldMuteDuringAssistantSpeech}
                  onChange={(event) => {
                    const nextValue = event.target.checked;
                    shouldMuteDuringAssistantSpeechRef.current = nextValue;
                    setShouldMuteDuringAssistantSpeech(nextValue);
                    const localAudioTrack = localAudioTrackRef.current;
                    if (localAudioTrack) {
                      localAudioTrack.enabled = !(nextValue && isAssistantSpeaking);
                    }
                  }}
                />
                AI発話中はマイクを自動ミュート
              </label>
              <div className="actions session-actions">
                {!isConnected ? (
                  <button className="primary-button" onClick={startInterview} disabled={isStarting || isFinishing}>
                    {isStarting ? "接続中" : "面接を開始する"}
                  </button>
                ) : (
                  <button className="secondary-button" onClick={stopInterviewAudio} disabled={isFinishing}>
                    音声を停止する
                  </button>
                )}
                <button className="secondary-button" onClick={onBilling} disabled={isFinishing}>
                  クレジット追加
                </button>
              </div>
            </div>
          </div>

          <aside className="preview-log session-live-log" aria-live="polite" ref={conversationLogRef}>
            <strong>対話ログ</strong>
            {conversationLog.length > 0 ? (
              conversationLog.map((entry) => (
                <div key={entry.id} className="session-log-entry">
                  <p>{entry.speaker === "assistant" ? "AI面接官" : "あなた"}</p>
                  <span>
                    {entry.content}
                    {entry.isPartial ? <span className="partial-indicator">...</span> : null}
                  </span>
                </div>
              ))
            ) : (
              <p className="empty-conversation">接続後、ここにあなたとAIの対話が表示されます。</p>
            )}
          </aside>
        </div>
      </div>

      {shouldShowConnectionLog ? (
        <div className="conversation-box realtime-log">
          <p className="conversation-heading">接続ログ</p>
          {events.map((event, index) => (
            <p key={`${event}-${index}`}>{event}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
