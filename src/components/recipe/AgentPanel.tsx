import {
  Activity,
  Bot,
  Braces,
  CircleCheck,
  Info,
  LoaderCircle,
  MessagesSquare,
  Mic,
  Send,
  Square,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  generateCookingAgentReply,
  getKitchenVadRecorder,
  initializeKitchenVadRecorder,
  logJamieTiming,
  synthesizeCookingAgentSpeech,
  transcribeCookingAudio,
  type ConversationMessage,
  type JamieTimingTrace,
  type KitchenToolExecution,
  type SpeechProgress,
  type TranscriptionProgress,
} from "../../services/kitchenAssistant";
import type { GenerationMetrics } from "../../services/recipeBuilder";
import { Modal } from "../../theme";

interface AgentPanelProps {
  isGenerating?: boolean;
  generationMetrics?: GenerationMetrics;
  rawRecipeJson?: string;
  servings: number;
  onServingsChange: (servings: number) => void;
  onScrollToStep: (step: number) => void;
  className?: string;
}

type ConversationTask = "idle" | "transcribing" | "thinking" | "speaking";
type ConversationEntry =
  ConversationMessage | (KitchenToolExecution & { role: "tool" });

const JAMIE_WAKE_NAMES = [
  "jamie",
  "jeremy",
  "jamey",
  "jayme",
  "jaymie",
  "jami",
  "jammy",
  "jimmy",
];

function hasJamieWakeName(transcript: string) {
  const words = transcript.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.some((word) => JAMIE_WAKE_NAMES.includes(word));
}

function normalizeJamieWakeName(transcript: string) {
  return transcript.replace(/[a-z]+/gi, (word) =>
    JAMIE_WAKE_NAMES.includes(word.toLowerCase()) ? "Jamie" : word
  );
}

export default function AgentPanel({
  isGenerating = false,
  generationMetrics,
  rawRecipeJson = "",
  servings,
  onServingsChange,
  onScrollToStep,
  className = "",
}: AgentPanelProps) {
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [sessionConversation, setSessionConversation] = useState<
    ConversationMessage[]
  >([]);
  const [conversationActive, setConversationActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [pendingTranscript, setPendingTranscript] = useState("");
  const [task, setTask] = useState<ConversationTask>("idle");
  const [transcriptionProgress, setTranscriptionProgress] =
    useState<TranscriptionProgress | null>(null);
  const [speechProgress, setSpeechProgress] = useState<SpeechProgress | null>(
    null
  );
  const [conversationError, setConversationError] = useState<string | null>(
    null
  );
  const [isJsonOpen, setIsJsonOpen] = useState(false);
  const [isConversationOpen, setIsConversationOpen] = useState(false);
  const [recorderStatus, setRecorderStatus] = useState("idle");
  const [recorderProgress, setRecorderProgress] = useState(0);
  const [volumeDb, setVolumeDb] = useState<number | null>(null);
  const [speechProbability, setSpeechProbability] = useState<number | null>(
    null
  );
  const [recordings, setRecordings] = useState<Blob[]>([]);
  const [recorderError, setRecorderError] = useState<Error | null>(null);
  const processedRecordings = useRef(new WeakSet<Blob>());
  const recordingQueue = useRef(Promise.resolve());
  const autoStartAttempted = useRef(false);
  const timingTraceSequence = useRef(0);
  const activeRecordingTrace = useRef<JamieTimingTrace | null>(null);
  const completedRecordingTraces = useRef<JamieTimingTrace[]>([]);
  const transcriptTimer = useRef<number | null>(null);
  const recorder = getKitchenVadRecorder();

  useEffect(() => {
    recorder.onReady(() => setRecorderStatus("ready"));
    recorder.onRecord((recording) =>
      setRecordings((current) => [recording, ...current])
    );
    recorder.onError((error) => {
      setRecorderError(error);
      setRecorderStatus("error");
    });
    recorder.onVolumeChange(setVolumeDb);
    recorder.onSpeechProbability(setSpeechProbability);
    recorder.onSpeechStart(() => setRecorderStatus("speech"));
    recorder.onSpeechEnd(() => setRecorderStatus("silence"));

    return () => {
      recorder.onReady(() => undefined);
      recorder.onRecord(() => undefined);
      recorder.onError(() => undefined);
      recorder.onVolumeChange(() => undefined);
      recorder.onSpeechProbability(() => undefined);
      recorder.onSpeechStart(() => undefined);
      recorder.onSpeechEnd(() => undefined);
    };
  }, [recorder]);

  useEffect(() => {
    if (isGenerating || isListening || autoStartAttempted.current) return;

    autoStartAttempted.current = true;
    void initializeKitchenVadRecorder()
      .then(async () => {
        setRecorderStatus("starting");
        await recorder.start();
        setIsListening(true);
      })
      .catch((error: unknown) => {
        setRecorderError(
          error instanceof Error ? error : new Error(String(error))
        );
        setRecorderStatus("error");
      });
  }, [isGenerating, isListening, recorder]);

  const initialize = async () => {
    setRecorderStatus("initializing");
    setRecorderProgress(0);
    await initializeKitchenVadRecorder((event) => {
      if (event.status === "ready") {
        setRecorderProgress(1);
        setRecorderStatus("initialized");
        return;
      }
      setRecorderProgress(event.progress);
      setRecorderStatus(event.status);
    });
    setRecorderStatus("initialized");
  };
  const start = async () => {
    setRecorderStatus("starting");
    await recorder.start();
  };
  const stop = () => {
    recorder.stop();
    setRecorderStatus("stopped");
  };
  const pause = () => {
    recorder.pause();
    setRecorderStatus("paused");
  };
  const resume = () => {
    recorder.resume();
    setRecorderStatus("resumed");
  };

  const sendPrompt = async (
    transcript: string,
    requireWakeName = true,
    timingTrace?: JamieTimingTrace
  ): Promise<boolean> => {
    const trace = timingTrace ?? {
      id: `text-${++timingTraceSequence.current}`,
      startedAt: performance.now(),
    };
    const hasWakeWord = hasJamieWakeName(transcript);
    if (requireWakeName && !conversationActive && !hasWakeWord) {
      logJamieTiming(trace, "recording_ignored", { reason: "no_wake_name" });
      return false;
    }

    if (!conversationActive) setConversationActive(true);
    const userMessage: ConversationMessage = {
      role: "user",
      content: transcript,
    };
    const nextSessionConversation = [...sessionConversation, userMessage];
    setConversation((current) => [...current, userMessage]);
    setTask("thinking");

    try {
      logJamieTiming(trace, "response_generation_started");
      const reply = await generateCookingAgentReply(
        nextSessionConversation,
        rawRecipeJson,
        servings,
        trace,
        (execution) => {
          setConversation((current) => {
            const existingIndex = current.findIndex(
              (entry) => entry.role === "tool" && entry.id === execution.id
            );
            const nextEntry: ConversationEntry = {
              role: "tool",
              ...execution,
            };
            if (existingIndex < 0) return [...current, nextEntry];

            return current.map((entry, index) =>
              index === existingIndex ? nextEntry : entry
            );
          });
        }
      );
      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: reply.message,
      };
      setConversation((current) => [...current, assistantMessage]);
      if (reply.servings !== undefined) onServingsChange(reply.servings);
      if (reply.step !== undefined) onScrollToStep(reply.step);
      if (reply.endConversation) {
        setConversationActive(false);
        setSessionConversation([]);
      } else {
        setSessionConversation([...nextSessionConversation, assistantMessage]);
      }
      setTask("speaking");
      setSpeechProgress({ state: "loading", progress: 0 });
      if (isListening) pause();
      const speechStartedAt = performance.now();
      logJamieTiming(trace, "speech_started");
      try {
        await synthesizeCookingAgentSpeech(reply.message, setSpeechProgress);
        logJamieTiming(trace, "turn_done", {
          speechDurationMs: Number(
            (performance.now() - speechStartedAt).toFixed(1)
          ),
        });
      } finally {
        if (isListening) resume();
        setSpeechProgress(null);
      }
    } catch (error) {
      logJamieTiming(trace, "turn_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      setTask("idle");
    }
    return true;
  };

  const processRecording = useEffectEvent(
    async (recording: Blob, timingTrace: JamieTimingTrace) => {
      const transcriptionStartedAt = performance.now();
      setTask("transcribing");
      setTranscriptionProgress({ state: "loading", progress: 0 });
      setConversationError(null);
      try {
        const rawTranscript = await transcribeCookingAudio(
          recording,
          setTranscriptionProgress
        );
        logJamieTiming(timingTrace, "transcription_done", {
          durationMs: Number(
            (performance.now() - transcriptionStartedAt).toFixed(1)
          ),
          characters: rawTranscript.length,
        });
        const transcript = normalizeJamieWakeName(rawTranscript);
        if (!transcript) {
          logJamieTiming(timingTrace, "recording_ignored", {
            reason: "empty_transcript",
          });
          return;
        }
        if (isListening) pause();
        setPendingTranscript(transcript);
        if (transcriptTimer.current !== null) {
          window.clearTimeout(transcriptTimer.current);
        }
        transcriptTimer.current = window.setTimeout(() => {
          setPendingTranscript("");
          transcriptTimer.current = null;
        }, 4_000);
        await sendPrompt(transcript, true, timingTrace);
      } catch (error) {
        setConversationError(
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        setTranscriptionProgress(null);
        setTask((current) => (current === "transcribing" ? "idle" : current));
        if (isListening) resume();
      }
    }
  );

  useEffect(() => {
    if (recorderStatus === "speech" && !activeRecordingTrace.current) {
      const trace = {
        id: `voice-${++timingTraceSequence.current}`,
        startedAt: performance.now(),
      };
      activeRecordingTrace.current = trace;
      logJamieTiming(trace, "recording_started");
      return;
    }

    if (recorderStatus !== "silence" || !activeRecordingTrace.current) return;

    const trace = activeRecordingTrace.current;
    activeRecordingTrace.current = null;
    completedRecordingTraces.current.push(trace);
  }, [recorderStatus]);

  useEffect(() => {
    for (const recording of recordings) {
      if (processedRecordings.current.has(recording)) continue;
      processedRecordings.current.add(recording);
      const timingTrace = completedRecordingTraces.current.shift() ?? {
        id: `voice-${++timingTraceSequence.current}`,
        startedAt: performance.now(),
      };
      logJamieTiming(timingTrace, "recording_ended", {
        recordingDurationMs: Number(
          (performance.now() - timingTrace.startedAt).toFixed(1)
        ),
        audioBytes: recording.size,
      });
      recordingQueue.current = recordingQueue.current
        .catch(() => undefined)
        .then(() => processRecording(recording, timingTrace));
    }
  }, [recordings]);

  useEffect(
    () => () => {
      if (transcriptTimer.current !== null) {
        window.clearTimeout(transcriptTimer.current);
      }
    },
    []
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsConversationOpen(false);
    };
    document.body.classList.toggle(
      "conversation-drawer-open",
      isConversationOpen
    );
    if (!isConversationOpen) return;

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("conversation-drawer-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isConversationOpen]);

  const handleToggleListening = async () => {
    if (isListening) {
      stop();
      setIsListening(false);
      setConversationActive(false);
      setSessionConversation([]);
      setPendingTranscript("");
      return;
    }

    await initialize();
    await start();
    setIsListening(true);
  };

  const handleMessageSubmit = async () => {
    const message = messageDraft.trim();
    if (!message || task !== "idle") return;

    setMessageDraft("");
    setConversationError(null);
    try {
      await sendPrompt(message, false);
    } catch (error) {
      setConversationError(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const taskLabel = {
    idle: conversationActive
      ? "Conversation active"
      : 'Ask or say "Jamie" to begin',
    transcribing:
      transcriptionProgress?.state === "loading"
        ? `Loading Whisper... ${transcriptionProgress.progress}%`
        : "Transcribing speech...",
    thinking: "Jamie is thinking...",
    speaking:
      speechProgress?.state === "loading"
        ? `Loading Kokoro... ${speechProgress.progress}%`
        : speechProgress?.state === "generating"
          ? "Generating speech..."
          : "Jamie is speaking...",
  }[task];

  return (
    <aside
      className={`overflow-hidden rounded-[1.75rem] bg-sage-dark text-cream ${className}`}
    >
      <section className="p-5 md:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-cream/12">
            <Activity size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-bold">Recipe generation</p>
            <p className="mt-1 text-xs leading-relaxed text-cream/60">
              {isGenerating
                ? "Building the recipe live."
                : "Generation complete."}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-cream/8 px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-[0.13em] text-cream/35">
              Tokens
            </p>
            <p className="mt-1 font-mono text-sm font-bold">
              {generationMetrics?.generatedTokens ?? 0}
            </p>
          </div>
          <div className="rounded-2xl bg-cream/8 px-3 py-2.5">
            <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.13em] text-cream/35">
              Speed
              <span className="group relative normal-case tracking-normal">
                <button
                  type="button"
                  aria-label="About generation speed"
                  aria-describedby="generation-speed-tooltip"
                  className="grid rounded-full transition hover:text-cream/70 focus-visible:text-cream/70 focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-cream"
                >
                  <Info size={11} aria-hidden="true" />
                </button>
                <span
                  id="generation-speed-tooltip"
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-3 py-2.5 text-xs font-normal leading-relaxed text-cream opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  Uses an experimental WebGPU runtime.
                </span>
              </span>
            </p>
            <p className="mt-1 font-mono text-sm font-bold">
              {(generationMetrics?.tokensPerSecond ?? 0).toFixed(1)} tps
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            console.log("raw_recipe_response", rawRecipeJson);
            setIsJsonOpen(true);
          }}
          className="mt-3 flex w-full items-center justify-between rounded-2xl bg-cream/10 px-4 py-3 text-left text-xs font-semibold text-cream/80 transition hover:bg-cream/15 hover:text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
        >
          <span className="flex items-center gap-2">
            <Braces size={15} /> View JSON response
          </span>
          <span className="font-mono text-[10px] font-normal text-cream/40">
            {rawRecipeJson.length.toLocaleString()} chars
          </span>
        </button>
      </section>

      {!isGenerating && (
        <section className="border-t border-cream/10 bg-ink/16 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-cream/12">
                <Bot size={19} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-xl font-bold">Ask Jamie</p>
                <p className="mt-1 text-xs leading-relaxed text-cream/60">
                  {taskLabel}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setIsConversationOpen(true)}
                className="relative grid size-11 place-items-center rounded-full bg-cream/10 text-cream transition hover:bg-cream/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
                aria-label="Open conversation history"
              >
                <MessagesSquare size={18} />
                {conversation.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full bg-paprika px-1 text-[8px] font-bold text-white">
                    {conversation.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleToggleListening()}
                disabled={task !== "idle" && !isListening}
                className={`grid size-11 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream ${
                  isListening
                    ? "bg-paprika text-white"
                    : "bg-cream text-sage-dark hover:bg-white"
                }`}
                aria-label={
                  isListening ? "Stop voice session" : "Start voice session"
                }
              >
                {isListening ? (
                  <Square size={16} fill="currentColor" />
                ) : (
                  <Mic size={19} />
                )}
              </button>
            </div>
          </div>

          <form
            className="mt-4 flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleMessageSubmit();
            }}
          >
            <label htmlFor="jamie-message" className="sr-only">
              Message Jamie
            </label>
            <textarea
              id="jamie-message"
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                void handleMessageSubmit();
              }}
              rows={2}
              disabled={task !== "idle"}
              placeholder="Ask about this recipe..."
              className="min-h-12 flex-1 resize-none rounded-2xl border border-cream/12 bg-cream/8 px-4 py-3 text-sm leading-5 text-cream outline-none placeholder:text-cream/35 focus:border-cream/35 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!messageDraft.trim() || task !== "idle"}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-cream text-sage-dark transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message to Jamie"
            >
              <Send size={18} />
            </button>
          </form>

          {(isListening || recorderStatus !== "idle") && (
            <div className="mt-4 rounded-2xl bg-cream/8 px-3 py-3">
              <div className="flex items-center justify-between gap-3 text-[10px] text-cream/50">
                <span className="capitalize">VAD: {recorderStatus}</span>
                <span className="font-mono">
                  {speechProbability === null
                    ? "--"
                    : `${Math.round(speechProbability * 100)}% speech`}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream/10">
                <div
                  className="h-full rounded-full bg-paprika transition-[width] duration-100"
                  style={{
                    width: `${Math.max(0, Math.min(100, speechProbability === null ? recorderProgress * 100 : speechProbability * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-2 font-mono text-[9px] text-cream/30">
                {volumeDb === null
                  ? "Waiting for microphone"
                  : `${volumeDb.toFixed(1)} dB`}
              </p>
            </div>
          )}

          {recorderError && (
            <p className="mt-3 rounded-2xl bg-paprika/20 px-3 py-2 text-xs text-cream/80">
              {recorderError.message}
            </p>
          )}
          {conversationError && (
            <p className="mt-3 rounded-2xl bg-paprika/20 px-3 py-2 text-xs text-cream/80">
              Jamie task failed: {conversationError}
            </p>
          )}

          {pendingTranscript && (
            <div className="mt-4 rounded-2xl border border-cream/12 bg-cream/8 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-cream/40">
                  Heard
                </p>
                <span className="text-[9px] text-cream/35">
                  {conversationActive || hasJamieWakeName(pendingTranscript)
                    ? "Sent automatically"
                    : "Waiting for Jamie"}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-cream/80">
                {pendingTranscript}
              </p>
            </div>
          )}

          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[9px] uppercase tracking-[0.12em] text-cream/30">
            <Volume2 size={11} /> Voice or text conversation
          </p>
        </section>
      )}

      <Modal
        open={isJsonOpen}
        onClose={() => setIsJsonOpen(false)}
        title="Generated JSON"
        description={
          isGenerating
            ? "Live constrained response"
            : "Complete constrained response"
        }
      >
        <pre className="min-h-48 p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink/75 md:p-6 md:text-sm">
          {rawRecipeJson || "Waiting for the first JSON text chunk..."}
        </pre>
      </Modal>
      {createPortal(
        <div className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden">
          <aside
            role="complementary"
            aria-labelledby="conversation-title"
            aria-hidden={!isConversationOpen}
            className={`pointer-events-auto absolute top-0 right-0 flex h-full w-[min(88vw,28rem)] flex-col border-l border-ink/10 bg-cream-light text-ink shadow-[-20px_0_70px_rgba(0,0,0,0.18)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isConversationOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <header className="flex items-center justify-between border-b border-ink/10 px-5 py-5">
              <div>
                <h2
                  id="conversation-title"
                  className="font-display text-2xl font-bold"
                >
                  Conversation
                </h2>
                <p className="mt-0.5 text-xs text-ink/45">
                  {conversation.length} conversation entries
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsConversationOpen(false)}
                className="grid size-10 place-items-center rounded-full border border-ink/10 bg-white transition hover:border-ink/25"
                aria-label="Close conversation history"
              >
                <X size={18} />
              </button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {conversation.length === 0 ? (
                <p className="mt-12 text-center text-sm text-ink/40">
                  Ask a question here or start listening and say “Jamie.”
                </p>
              ) : (
                conversation.map((entry, index) => {
                  if (entry.role === "tool") {
                    return (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-sage/15 bg-sage/8 p-3.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="grid size-7 place-items-center rounded-full bg-sage-dark text-cream">
                            <Wrench size={13} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs font-bold text-sage-dark">
                              {entry.name}
                            </p>
                            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink/40">
                              {entry.status === "running"
                                ? "Running tool"
                                : "Tool completed"}
                            </p>
                          </div>
                          {entry.status === "running" ? (
                            <LoaderCircle
                              size={16}
                              className="animate-spin text-sage-dark"
                            />
                          ) : (
                            <CircleCheck size={16} className="text-sage-dark" />
                          )}
                        </div>
                        {Object.keys(entry.arguments).length > 0 && (
                          <p className="mt-2 font-mono text-[10px] leading-relaxed text-ink/55">
                            {JSON.stringify(entry.arguments)}
                          </p>
                        )}
                        {entry.result && (
                          <p className="mt-1 font-mono text-[10px] leading-relaxed text-ink/40">
                            {JSON.stringify(entry.result)}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`${entry.role}-${index}`}
                      className={
                        entry.role === "user" ? "text-right" : "text-left"
                      }
                    >
                      <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.13em] text-ink/35">
                        {entry.role === "user" ? "You" : "Jamie"}
                      </p>
                      <p
                        className={`inline-block max-w-[90%] rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed ${
                          entry.role === "user"
                            ? "bg-paprika text-white"
                            : "bg-white shadow-sm"
                        }`}
                      >
                        {entry.content}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>,
        document.body
      )}
    </aside>
  );
}
