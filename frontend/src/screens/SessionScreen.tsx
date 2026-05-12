import { useEffect, useRef, useState } from "react";

import { useAuth } from "../state/auth";


type SessionScreenProps = {
  onFinish: () => void;
  onBilling: () => void;
};

type RealtimeStatus = "idle" | "starting" | "connected" | "error";

type SessionCreateResponse = {
  data: {
    session_id: string;
  };
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


export function SessionScreen({ onFinish, onBilling }: SessionScreenProps) {
  const { authState } = useAuth();
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const conversationLogRef = useRef<HTMLDivElement | null>(null);
  const shouldMuteDuringAssistantSpeechRef = useRef(true);
  const assistantSpeechTimeoutRef = useRef<number | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([
    "プレビュー準備完了。マイク接続を開始できます。",
  ]);
  const [conversationLog, setConversationLog] = useState<ConversationLogEntry[]>([]);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [shouldMuteDuringAssistantSpeech, setShouldMuteDuringAssistantSpeech] = useState(true);

  const appendEvent = (message: string) => {
    setEvents((currentEvents) => [message, ...currentEvents].slice(0, 6));
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
      if (assistantSpeechTimeoutRef.current !== null) {
        window.clearTimeout(assistantSpeechTimeoutRef.current);
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

  const setAssistantSpeaking = (nextIsSpeaking: boolean) => {
    if (assistantSpeechTimeoutRef.current !== null) {
      window.clearTimeout(assistantSpeechTimeoutRef.current);
      assistantSpeechTimeoutRef.current = null;
    }

    setIsAssistantSpeaking(nextIsSpeaking);
    const localAudioTrack = localAudioTrackRef.current;
    if (localAudioTrack && shouldMuteDuringAssistantSpeechRef.current) {
      localAudioTrack.enabled = !nextIsSpeaking;
    }

    if (nextIsSpeaking) {
      assistantSpeechTimeoutRef.current = window.setTimeout(() => {
        setAssistantSpeaking(false);
      }, 30000);
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
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done" ||
      type === "response.done"
    ) {
      setAssistantSpeaking(false);
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
      upsertConversationLog(data.response_id ?? `assistant-${Date.now()}`, "assistant", data.text ?? data.transcript ?? "");
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

  const createInterviewSession = async () => {
    const headers = authHeaders();
    headers.set("Content-Type", "application/json");
    const response = await fetch("/api/interview-sessions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "voice",
        job_role: "Webアプリケーションエンジニア",
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error?.message ?? "面接セッションを開始できませんでした。");
    }

    const body = (await response.json()) as SessionCreateResponse;
    return body.data.session_id;
  };

  const startRealtimePreview = async () => {
    setStatus("starting");
    setErrorMessage(null);
    setConversationLog([]);
    appendEvent("面接セッションを作成しています。");

    try {
      const nextSessionId = sessionId ?? (await createInterviewSession());
      setSessionId(nextSessionId);

      appendEvent("マイク権限を確認しています。");
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = localStream;
      localAudioTrackRef.current = localStream.getAudioTracks()[0] ?? null;

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      localStream.getTracks().forEach((track) => {
        peer.addTrack(track, localStream);
      });

      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        appendEvent("AI音声の受信を開始しました。");
      };

      const channel = peer.createDataChannel("oai-events");
      channel.onopen = () => {
        appendEvent("gpt-realtime-2 とのイベントチャンネルを開きました。");
        setAssistantSpeaking(true);
        channel.send(JSON.stringify({
          type: "response.create",
          response: {
            instructions: "短く挨拶してから、自己紹介を促してください。",
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
      appendEvent("OpenAI Realtime APIへ接続しています。");

      const headers = authHeaders();
      headers.set("Content-Type", "application/sdp");
      const response = await fetch(`/api/interview-sessions/${nextSessionId}/realtime-call`, {
        method: "POST",
        headers,
        body: offer.sdp ?? "",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Realtime接続に失敗しました。");
      }

      const answerSdp = await response.text();
      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
      setStatus("connected");
      appendEvent("接続完了。音声で面接練習を始められます。");
    } catch (error) {
      stopRealtimePreview();
      const message = error instanceof Error ? error.message : "Realtimeプレビューを開始できませんでした。";
      setErrorMessage(message);
      setStatus("error");
      appendEvent(message);
    }
  };

  const stopRealtimePreview = () => {
    if (assistantSpeechTimeoutRef.current !== null) {
      window.clearTimeout(assistantSpeechTimeoutRef.current);
      assistantSpeechTimeoutRef.current = null;
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
    setIsAssistantSpeaking(false);
    setStatus((currentStatus) => currentStatus === "connected" ? "idle" : currentStatus);
  };

  const handleFinish = () => {
    stopRealtimePreview();
    onFinish();
  };

  const isStarting = status === "starting";
  const isConnected = status === "connected";

  return (
    <section className="screen-card session-screen-card">
      <div className="session-top-row">
        <div>
          <p className="screen-label">Realtime Preview</p>
          <h2>gpt-realtime-2 面接練習</h2>
          <p className="section-note">マイクで話すと、AI面接コーチが音声で返答します。</p>
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
                : "Model: gpt-realtime-2 / Voice: marin"}
            </p>
          </div>
        </div>
      </div>

      {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}

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

      <div className="conversation-box realtime-log">
        <p className="conversation-heading">接続ログ</p>
        {events.map((event, index) => (
          <p key={`${event}-${index}`}>{event}</p>
        ))}
      </div>

      <div className="actions">
        {!isConnected ? (
          <button className="primary-button" onClick={startRealtimePreview} disabled={isStarting}>
            {isStarting ? "接続中" : "音声プレビュー開始"}
          </button>
        ) : (
          <button className="secondary-button" onClick={stopRealtimePreview}>
            音声プレビュー停止
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
