import {
  DynamicCache,
  ModelRegistry,
  TextStreamer,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type TextGenerationPipeline,
} from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";
import {
  VadRecorder,
  type ProgressEvent as VadProgressEvent,
} from "vad-recorder";
import { getTextGenerationPipeline } from "./shared";

const WHISPER_MODEL_ID = "onnx-community/whisper-base";
const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null =
  null;
let textToSpeechPromise: Promise<KokoroTTS> | null = null;
let vadInitializationPromise: Promise<void> | null = null;
let kitchenAssistantCache: InstanceType<typeof DynamicCache> | null = null;
let kitchenAssistantCacheSystemPrompt = "";
let kitchenToolCallSequence = 0;

interface NativeTranscriptionTiming {
  encoderExecution: "float32" | "mixed-f16" | undefined;
  melMs: number;
  encodeMs: number;
  crossMs: number;
  decodeMs: number;
  decodedTokens: number;
}

const kitchenVadRecorder = new VadRecorder({
  threshold: 0.55,
  minSpeechDuration: 250,
  minSilenceDuration: 900,
  prependSilence: 120,
  appendSilence: 300,
});

export interface KitchenModelDownloadInfo {
  cachedFiles: number;
  downloadBytes: number;
  files: number;
  hasUnknownSize: boolean;
  totalBytes: number;
}

async function inspectModelFiles(
  model: Parameters<typeof ModelRegistry.get_file_metadata>[0],
  files: string[]
): Promise<KitchenModelDownloadInfo> {
  const metadata = await Promise.all(
    files.map((file) => ModelRegistry.get_file_metadata(model, file))
  );
  const existing = metadata.filter((file) => file.exists);
  const uncached = existing.filter((file) => !file.fromCache);
  return {
    cachedFiles: existing.length - uncached.length,
    downloadBytes: uncached.reduce(
      (total, file) => total + (file.size ?? 0),
      0
    ),
    files: existing.length,
    hasUnknownSize: existing.some((file) => file.size === undefined),
    totalBytes: existing.reduce((total, file) => total + (file.size ?? 0), 0),
  };
}

export async function inspectKitchenAssistantModels() {
  const [vad, transcriptionFiles, speechFiles] = await Promise.all([
    VadRecorder.info(),
    ModelRegistry.get_pipeline_files(
      "automatic-speech-recognition",
      "onnx-community/whisper-base",
      {
        device: "webgpu",
        dtype: "auto",
      }
    ),
    ModelRegistry.get_pipeline_files("text-to-audio", KOKORO_MODEL_ID, {
      device: "webgpu",
      dtype: "fp32",
    }),
  ]);
  const [transcription, speech] = await Promise.all([
    inspectModelFiles(WHISPER_MODEL_ID, transcriptionFiles),
    inspectModelFiles(KOKORO_MODEL_ID, speechFiles),
  ]);
  return {
    vad: {
      cachedFiles: vad.isCached ? 1 : 0,
      downloadBytes: vad.isCached ? 0 : vad.downloadSize,
      files: 1,
      hasUnknownSize: vad.downloadSize === 0,
      totalBytes: vad.downloadSize,
    },
    transcription,
    speech,
  };
}

export function getKitchenVadRecorder() {
  return kitchenVadRecorder;
}

export function initializeKitchenVadRecorder(
  onProgress?: (progress: VadProgressEvent) => void
) {
  vadInitializationPromise ??= kitchenVadRecorder
    .initialize(onProgress)
    .catch((error) => {
      vadInitializationPromise = null;
      throw error;
    });
  return vadInitializationPromise;
}

export interface JamieTimingTrace {
  id: string;
  startedAt: number;
}

export function logJamieTiming(
  trace: JamieTimingTrace,
  event: string,
  details: Record<string, unknown> = {}
) {
  console.log("jamie_timing", {
    traceId: trace.id,
    event,
    elapsedMs: Number((performance.now() - trace.startedAt).toFixed(1)),
    ...details,
  });
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TranscriptionProgress {
  state: "loading" | "transcribing";
  progress: number;
}

export interface SpeechProgress {
  state: "loading" | "generating" | "playing";
  progress: number;
}

export interface KitchenAssistantReply {
  message: string;
  endConversation: boolean;
  servings?: number;
  step?: number;
}

export interface KitchenToolExecution {
  id: string;
  name: string;
  arguments: Record<string, number>;
  status: "running" | "completed";
  result?: Record<string, unknown>;
}

interface KitchenToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: Record<string, number>;
  };
}

interface KitchenChatMessage {
  role: string;
  content: string;
  tool_calls?: KitchenToolCall[];
  tool_call_id?: string;
  name?: string;
}

class TokenTimingStreamer extends TextStreamer {
  constructor(
    tokenizer: ConstructorParameters<typeof TextStreamer>[0],
    onTokens: (tokens: bigint[]) => void
  ) {
    super(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: () => undefined,
      token_callback_function: onTokens,
    });
  }

  override on_finalized_text() {
    return;
  }
}

const kitchenTools = [
  {
    type: "function",
    function: {
      name: "adjust_servings",
      description:
        "Change the displayed recipe to a new total serving count. Call this whenever the user asks to make, scale, or adjust the recipe for a different number of people. Never merely describe this change in text.",
      parameters: {
        type: "object",
        properties: {
          servings: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            description: "New total number of servings",
          },
        },
        required: ["servings"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_recipe_step",
      description:
        "Scroll the displayed recipe to a specific instruction step. Call this whenever the user asks to see, find, return to, or explain a particular step.",
      parameters: {
        type: "object",
        properties: {
          step: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            description: "One-based recipe step number",
          },
        },
        required: ["step"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "end_conversation",
      description:
        "Return Jamie to wake-word mode because the conversation is over. Call this whenever the user indicates they need nothing else, including 'no thanks', 'that is all', 'for now', 'I am done', closing thanks, or goodbye. Use your judgment for equivalent intent instead of replying without the tool.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

function parseKitchenToolCalls(response: string) {
  const calls: KitchenToolCall[] = [];
  const toolCallPattern =
    /(?:<\|tool_call>)?\s*(?:call:)?(adjust_servings|show_recipe_step|end_conversation)\{([^{}]*)\}(?:<tool_call\|>)?/g;
  let message = response
    .replace(toolCallPattern, (_, name: string, rawArguments: string) => {
      const argumentsRecord: Record<string, number> = {};
      for (const key of ["servings", "step"]) {
        const match = rawArguments.match(
          new RegExp(`["']?${key}["']?\\s*:\\s*(\\d+)`)
        );
        if (match) argumentsRecord[key] = Number(match[1]);
      }
      calls.push({
        id: `jamie_tool_${++kitchenToolCallSequence}`,
        type: "function",
        function: { name, arguments: argumentsRecord },
      });
      return "";
    })
    .replace(/<\|(?:turn|channel)[^>]*>|<(?:turn|channel)\|>/g, "")
    .replace(/<\|tool_call>|<tool_call\|>/g, "")
    .trim();

  if (
    calls.length === 0 &&
    /^(?:call:)?end_conversation(?:\(\)|\{\})?$/.test(message)
  ) {
    calls.push({
      id: `jamie_tool_${++kitchenToolCallSequence}`,
      type: "function",
      function: { name: "end_conversation", arguments: {} },
    });
    message = "";
  }

  return { calls, message };
}

async function generateKitchenChatTurn(
  generator: TextGenerationPipeline,
  messages: KitchenChatMessage[],
  pastKeyValues: InstanceType<typeof DynamicCache>
) {
  let generatedTokens = 0;
  let firstTokenAt: number | null = null;
  const startedAt = performance.now();
  const output = await generator(messages, {
    tools: kitchenTools,
    max_new_tokens: 256,
    do_sample: false,
    past_key_values: pastKeyValues,
    streamer: new TokenTimingStreamer(generator.tokenizer, (tokenIds) => {
      firstTokenAt ??= performance.now();
      generatedTokens += tokenIds.length;
    }),
  });
  const finishedAt = performance.now();
  const generatedChat = output[0]?.generated_text;
  const content = generatedChat?.[generatedChat.length - 1]?.content;
  return {
    response: typeof content === "string" ? content.trim() : "",
    generatedTokens,
    durationMs: finishedAt - startedAt,
    timeToFirstTokenMs:
      firstTokenAt === null ? finishedAt - startedAt : firstTokenAt - startedAt,
    decodeDurationMs:
      firstTokenAt === null ? 0 : Math.max(0, finishedAt - firstTokenAt),
    decodedTokens: Math.max(0, generatedTokens - 1),
  };
}

function getSpeechRecognitionPipeline(
  onProgress?: (progress: TranscriptionProgress) => void
): Promise<AutomaticSpeechRecognitionPipeline> {
  transcriberPromise ??= pipeline(
    "automatic-speech-recognition",
    WHISPER_MODEL_ID,
    {
      device: "webgpu",
      dtype: "auto",
      progress_callback: (progress) => {
        if (progress.status !== "progress_total") return;
        onProgress?.({
          state: "loading",
          progress: Math.floor(progress.progress),
        });
      },
    }
  ).catch((error) => {
    transcriberPromise = null;
    throw error;
  });
  return transcriberPromise;
}

export function prepareKitchenTranscription(
  onProgress?: (progress: TranscriptionProgress) => void
) {
  return getSpeechRecognitionPipeline(onProgress);
}

async function decodeRecordedAudio(audio: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: 16_000 });
  try {
    const buffer = await context.decodeAudioData(await audio.arrayBuffer());
    return new Float32Array(buffer.getChannelData(0));
  } finally {
    await context.close();
  }
}

export async function transcribeCookingAudio(
  audio: Blob,
  onProgress?: (progress: TranscriptionProgress) => void
): Promise<string> {
  const transcriber = await getSpeechRecognitionPipeline(onProgress);
  onProgress?.({ state: "transcribing", progress: 100 });
  const waveform = await decodeRecordedAudio(audio);
  const nativeTimings: NativeTranscriptionTiming[] = [];
  const startedAt = performance.now();
  try {
    const result = await transcriber(waveform, {
      language: "en",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      max_new_tokens: 448,
      do_sample: false,
      num_beams: 1,
      return_timestamps: false,
    });
    const elapsedMs = performance.now() - startedAt;
    const sum = (
      key: "melMs" | "encodeMs" | "crossMs" | "decodeMs" | "decodedTokens"
    ) => nativeTimings.reduce((total, timing) => total + timing[key], 0);
    const melMs = sum("melMs");
    const encodeMs = sum("encodeMs");
    const crossMs = sum("crossMs");
    const decodeMs = sum("decodeMs");
    console.log("jamie_transcription_timing", {
      elapsedMs: Number(elapsedMs.toFixed(1)),
      chunks: nativeTimings.length,
      decodedTokens: sum("decodedTokens"),
      encoderExecution: nativeTimings[0]?.encoderExecution,
      melMs: Number(melMs.toFixed(1)),
      encodeMs: Number(encodeMs.toFixed(1)),
      crossMs: Number(crossMs.toFixed(1)),
      decodeMs: Number(decodeMs.toFixed(1)),
      pipelineMs: Number(
        Math.max(0, elapsedMs - melMs - encodeMs - crossMs - decodeMs).toFixed(
          1
        )
      ),
    });
    return result.text.trim();
  } finally {
  }
}

export async function generateCookingAgentReply(
  conversation: ConversationMessage[],
  recipeContext: string,
  currentServings: number,
  timingTrace?: JamieTimingTrace,
  onToolExecution?: (execution: KitchenToolExecution) => void
): Promise<KitchenAssistantReply> {
  const generator = await getTextGenerationPipeline();
  const systemPrompt =
    "You are Jamie, a concise and practical cooking companion. First decide whether the latest user message requires one of the available tools. When a tool applies, use the chat template's native tool-call mechanism; never print or mention the tool name as natural-language text. Your entire first response must be the tool call with no natural-language text. Wait for the tool result before confirming the action. Never claim, promise, or describe an action instead of calling its tool. Call adjust_servings for every request to change the serving count. Call show_recipe_step for every request concerning a particular recipe step. Call end_conversation whenever you judge that the user needs nothing else or is ending the exchange, including phrases such as 'for now', 'no thanks', 'that is all', closing thanks, or goodbye. Do not ask another question when ending the conversation. When no tool applies, answer questions about the recipe, substitutions, preparation, timing, and cooking technique in no more than three short sentences. Responses will be spoken aloud, so use natural conversational English without markdown or lists. After every non-terminal response, ask if you can help with anything else. The currently displayed serving count is " +
    currentServings +
    ". The current recipe JSON is: " +
    recipeContext;
  if (
    !kitchenAssistantCache ||
    conversation.length <= 1 ||
    kitchenAssistantCacheSystemPrompt !== systemPrompt
  ) {
    await kitchenAssistantCache?.dispose();
    kitchenAssistantCache = new DynamicCache();
    kitchenAssistantCacheSystemPrompt = systemPrompt;
  }
  const pastKeyValues = kitchenAssistantCache;
  const messages: KitchenChatMessage[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...conversation.map((message) => ({ ...message })),
  ];
  const reply: KitchenAssistantReply = {
    message: "",
    endConversation: false,
  };
  let completedRounds = 0;
  let toolCallCount = 0;
  let totalGeneratedTokens = 0;
  let totalGenerationMs = 0;
  let totalTimeToFirstTokenMs = 0;
  let totalDecodeDurationMs = 0;
  let totalDecodedTokens = 0;

  for (let round = 0; round < 3; round += 1) {
    if (round > 0 && timingTrace) {
      logJamieTiming(timingTrace, "agent_loop_started", { round: round + 1 });
    }
    const {
      response,
      generatedTokens,
      durationMs,
      timeToFirstTokenMs,
      decodeDurationMs,
      decodedTokens,
    } = await generateKitchenChatTurn(generator, messages, pastKeyValues);
    completedRounds += 1;
    totalGeneratedTokens += generatedTokens;
    totalGenerationMs += durationMs;
    totalTimeToFirstTokenMs += timeToFirstTokenMs;
    totalDecodeDurationMs += decodeDurationMs;
    totalDecodedTokens += decodedTokens;
    if (timingTrace) {
      logJamieTiming(timingTrace, "agent_loop_generated", {
        round: round + 1,
        durationMs: Number(durationMs.toFixed(1)),
        generatedTokens,
        timeToFirstTokenMs: Number(timeToFirstTokenMs.toFixed(1)),
        tps: Number(
          (decodeDurationMs > 0
            ? decodedTokens / (decodeDurationMs / 1000)
            : 0
          ).toFixed(1)
        ),
      });
    }
    const parsed = parseKitchenToolCalls(response);
    const calls = parsed.calls;
    const message = parsed.message;
    toolCallCount += calls.length;
    const generatedMessage: KitchenChatMessage = {
      role: "assistant",
      content: message,
      ...(calls.length > 0 ? { tool_calls: calls } : {}),
    };
    console.log("kitchen_assistant_messages", [...messages, generatedMessage]);
    if (calls.length === 0) {
      reply.message = message;
      break;
    }

    messages.push(generatedMessage);
    for (const call of calls) {
      onToolExecution?.({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
        status: "running",
      });
      if (timingTrace) {
        logJamieTiming(timingTrace, "tool_called", {
          round: round + 1,
          tool: call.function.name,
          arguments: call.function.arguments,
        });
      }
      let result: Record<string, unknown> = {
        success: false,
        error: `Unknown tool: ${call.function.name}`,
      };
      if (call.function.name === "adjust_servings") {
        result = { success: false, error: "Invalid serving count" };
        const servings = call.function.arguments.servings;
        if (servings >= 1 && servings <= 12) {
          reply.servings = servings;
          result = { success: true, servings };
        }
      } else if (call.function.name === "show_recipe_step") {
        result = { success: false, error: "Invalid recipe step" };
        const step = call.function.arguments.step;
        if (step >= 1 && step <= 50) {
          reply.step = step;
          result = { success: true, step };
        }
      } else if (call.function.name === "end_conversation") {
        reply.endConversation = true;
        result = { success: true };
      }
      onToolExecution?.({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
        status: "completed",
        result,
      });
      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        tool_call_id: call.id,
        name: call.function.name,
      });
    }
  }

  if (!reply.message) {
    reply.message = reply.endConversation
      ? "Goodbye for now."
      : "Done. Can I help with anything else?";
  }
  if (timingTrace) {
    logJamieTiming(timingTrace, "response_generation_done", {
      rounds: completedRounds,
      toolCalls: toolCallCount,
      generatedTokens: totalGeneratedTokens,
      generationDurationMs: Number(totalGenerationMs.toFixed(1)),
      timeToFirstTokenMs: Number(totalTimeToFirstTokenMs.toFixed(1)),
      decodeDurationMs: Number(totalDecodeDurationMs.toFixed(1)),
      tps: Number(
        (totalDecodeDurationMs > 0
          ? totalDecodedTokens / (totalDecodeDurationMs / 1000)
          : 0
        ).toFixed(1)
      ),
    });
  }
  if (reply.endConversation) {
    await kitchenAssistantCache.dispose();
    kitchenAssistantCache = null;
    kitchenAssistantCacheSystemPrompt = "";
  }
  return reply;
}

function getTextToSpeech(
  onProgress?: (progress: SpeechProgress) => void
): Promise<KokoroTTS> {
  textToSpeechPromise ??= KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
    device: "webgpu",
    progress_callback: (progress) => {
      if (progress.status !== "progress") return;
      onProgress?.({
        state: "loading",
        progress: Math.floor(progress.progress),
      });
    },
  }).catch((error) => {
    textToSpeechPromise = null;
    throw error;
  });
  return textToSpeechPromise;
}

export function prepareKitchenSpeech(
  onProgress?: (progress: SpeechProgress) => void
) {
  return getTextToSpeech(onProgress);
}

async function playAudioBlob(audioBlob: Blob): Promise<void> {
  const url = URL.createObjectURL(audioBlob);
  const audio = new Audio(url);
  try {
    await audio.play();
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Kokoro audio playback failed."));
    });
  } finally {
    audio.pause();
    URL.revokeObjectURL(url);
  }
}

export async function synthesizeCookingAgentSpeech(
  text: string,
  onProgress?: (progress: SpeechProgress) => void
): Promise<void> {
  const tts = await getTextToSpeech(onProgress);
  onProgress?.({ state: "generating", progress: 100 });
  const audio = await tts.generate(text, { voice: "af_sky" });
  onProgress?.({ state: "playing", progress: 100 });
  await playAudioBlob(audio.toBlob());
}
