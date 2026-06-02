import { useEffect, useRef, useState } from "react";

import { buildApiUrl } from "../lib/api/client";
import { getNextMaintenanceAutoStopAt } from "../lib/maintenance";
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
      if (assistantSpeechFallbackTimeoutRef.current !== null) {
        window.clearTimeout(assistantSpeechFallbackTimeoutRef.current);
      }
      if (assistantMuteReleaseTimeoutRef.current !== null) {
        window.clearTimeout(assistantMuteReleaseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const autoStopAt = getNextMaintenanceAutoStopAt();
    const delayMs = autoStopAt.getTime() - Date.now();
    if (delayMs <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setErrorMessage("システムメンテナンス開始のため、面接を自動終了します。");
      void handleFinish();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [sessionId]);

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

      const headers = authHeaders();
      headers.set("Content-Type", "application/sdp");
      const response = await fetch(buildApiUrl(`/api/interview-sessions/${nextSessionId}/realtime-call`), {
        method: "POST",
        headers,
        body: offer.sdp ?? "",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Realtime接続に失敗しました。");
      }

      const answerSdp = await response.text();
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
    stopInterviewAudio();
    const currentSessionId = sessionIdRef.current;
    let reflection: SessionReflection | null = null;
    if (currentSessionId) {
      await Promise.allSettled(pendingMessageSavesRef.current);
      const headers = authHeaders();
      await fetch(buildApiUrl(`/api/interview-sessions/${currentSessionId}/complete`), {
        method: "POST",
        headers,
      }).catch(() => undefined);
      const reflectionResponse = await fetch(buildApiUrl(`/api/interview-sessions/${currentSessionId}/reflection`), {
        method: "POST",
        headers,
      }).catch(() => undefined);
      if (reflectionResponse?.ok) {
        const body = await reflectionResponse.json().catch(() => null);
        reflection = body?.data ?? null;
      }
    }
    onFinish(reflection);
  };

  const isStarting = status === "starting";
  const isConnected = status === "connected";
  const shouldShowConnectionLog = import.meta.env.DEV;

  return (
    <section className="screen-card session-screen-card">
      <div className="session-top-row">
        <div>
          <p className="screen-label">Interview</p>
          <h2>面接練習</h2>
          <p className="section-note">マイクで話すと、AI面接コーチが音声で返答します。</p>
          {resumeFileName && !shouldIgnoreResume ? <p className="section-note">使用レジュメ: {resumeFileName}</p> : null}
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
        </div>

        <div className="realtime-panel" aria-live="polite">
          <div className={`realtime-meter realtime-meter-${status}`}>
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="realtime-status">
              {isConnected ? "接続中" : isStarting ? "接続準備中" : "未接続"}
            </p>
            <p className="section-note">
              {isAssistantSpeaking && shouldMuteDuringAssistantSpeech
                ? "AI応答中: マイク一時ミュート"
                : "Voice: marin"}
            </p>
          </div>
        </div>
      </div>

      {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
      {isStarting ? (
        <LoadingState
          title="接続準備中"
          body={connectionStep}
        />
      ) : null}

      <div className="conversation-box session-conversation-log" aria-live="polite" ref={conversationLogRef}>
        <p className="conversation-heading">対話ログ</p>
        {conversationLog.length > 0 ? (
          conversationLog.map((entry) => (
            <div
              key={entry.id}
              className={entry.speaker === "assistant" ? "chat-row assistant-row" : "chat-row user-row"}
            >
              <p className="chat-speaker">{entry.speaker === "assistant" ? "AI面接コーチ" : "あなた"}</p>
              <div className={entry.speaker === "assistant" ? "chat-bubble assistant-bubble" : "chat-bubble user-bubble"}>
                {entry.content}
                {entry.isPartial ? <span className="partial-indicator">...</span> : null}
              </div>
            </div>
          ))
        ) : (
          <p className="empty-conversation">接続後、あなたとAIの発話がここに表示されます。</p>
        )}
      </div>

      {shouldShowConnectionLog ? (
        <div className="conversation-box realtime-log">
          <p className="conversation-heading">接続ログ</p>
          {events.map((event, index) => (
            <p key={`${event}-${index}`}>{event}</p>
          ))}
        </div>
      ) : null}

      <div className="actions">
        {!isConnected ? (
          <button className="primary-button" onClick={startInterview} disabled={isStarting}>
            {isStarting ? "接続中" : "面接を開始する"}
          </button>
        ) : (
          <button className="secondary-button" onClick={stopInterviewAudio}>
            音声を停止する
          </button>
        )}
        <button className="secondary-button" onClick={onBilling}>
          クレジット追加
        </button>
        <button className="primary-button" onClick={handleFinish}>
          面接を終了する
        </button>
      </div>
    </section>
  );
}
