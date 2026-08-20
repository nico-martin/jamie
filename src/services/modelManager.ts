import {
  initializeKitchenVadRecorder,
  inspectKitchenAssistantModels,
  prepareKitchenSpeech,
  prepareKitchenTranscription,
  type KitchenModelDownloadInfo,
} from "./kitchenAssistant";
import {
  getDownloadInfo,
  getModelLoadStatus,
  getTextGenerationPipeline,
  subscribeToModelLoadStatus,
  type DownloadInfo,
} from "./shared";

export type AppModelId = "gemma" | "vad" | "whisper" | "kokoro";
export type AppModelState =
  "checking" | "ready" | "downloading" | "loading" | "error";

export interface AppModelStatus {
  id: AppModelId;
  name: string;
  purpose: string;
  state: AppModelState;
  progress: number;
  cached: boolean;
  downloadBytes: number;
  totalBytes: number;
  hasUnknownSize: boolean;
  error?: string;
}

export interface AppModelsStatus {
  models: AppModelStatus[];
}

const MODEL_DETAILS: Record<
  AppModelId,
  Pick<AppModelStatus, "name" | "purpose">
> = {
  gemma: { name: "Gemma 4", purpose: "Recipe generation and Jamie" },
  vad: { name: "Silero VAD", purpose: "Speech detection" },
  whisper: { name: "Whisper Base", purpose: "Speech transcription" },
  kokoro: { name: "Kokoro 82M", purpose: "Jamie's voice" },
};

const emptyModel = (id: AppModelId): AppModelStatus => ({
  id,
  ...MODEL_DETAILS[id],
  state: "checking",
  progress: 0,
  cached: false,
  downloadBytes: 0,
  totalBytes: 0,
  hasUnknownSize: false,
});

let status: AppModelsStatus = {
  models: (["gemma", "vad", "whisper", "kokoro"] as const).map(emptyModel),
};
let inspectionPromise: Promise<void> | null = null;
let preparationPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function updateModel(id: AppModelId, update: Partial<AppModelStatus>) {
  status = {
    models: status.models.map((model) =>
      model.id === id ? { ...model, ...update } : model
    ),
  };
  listeners.forEach((listener) => listener());
}

function applyDownloadInfo(
  id: AppModelId,
  info: DownloadInfo | KitchenModelDownloadInfo
) {
  const cached = info.files > 0 && info.cachedFiles === info.files;
  updateModel(id, {
    state: "ready",
    progress: cached ? 100 : 0,
    cached,
    downloadBytes: info.downloadBytes,
    totalBytes: info.totalBytes,
    hasUnknownSize: info.hasUnknownSize,
    error: undefined,
  });
}

export function getAppModelsStatus() {
  return status;
}

export function subscribeToAppModelsStatus(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function inspectAppModels() {
  inspectionPromise ??= Promise.all([
    getDownloadInfo().then((info) => applyDownloadInfo("gemma", info)),
    inspectKitchenAssistantModels().then((models) => {
      applyDownloadInfo("vad", models.vad);
      applyDownloadInfo("whisper", models.transcription);
      applyDownloadInfo("kokoro", models.speech);
    }),
  ])
    .then(() => undefined)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      for (const model of status.models) {
        if (model.state === "checking") {
          updateModel(model.id, { state: "error", error: message });
        }
      }
      inspectionPromise = null;
      throw error;
    });
  return inspectionPromise;
}

export function prepareAppModels() {
  preparationPromise ??= inspectAppModels().then(async () => {
    for (const model of status.models) {
      updateModel(model.id, {
        state: model.cached ? "loading" : "downloading",
        progress: model.cached ? 100 : 0,
      });
    }

    const unsubscribe = subscribeToModelLoadStatus(() => {
      const gemma = getModelLoadStatus();
      updateModel("gemma", {
        state:
          gemma.state === "error"
            ? "error"
            : gemma.state === "ready"
              ? "ready"
              : gemma.state,
        progress: gemma.progress,
        error: gemma.error,
      });
    });

    const preparations = [
      getTextGenerationPipeline().then(() =>
        updateModel("gemma", { state: "ready", progress: 100, cached: true })
      ),
      initializeKitchenVadRecorder((progress) => {
        updateModel("vad", {
          state: progress.status === "ready" ? "ready" : progress.status,
          progress:
            progress.status === "ready" ? 100 : Math.floor(progress.progress),
        });
      }).then(() =>
        updateModel("vad", { state: "ready", progress: 100, cached: true })
      ),
      prepareKitchenTranscription((progress) => {
        updateModel("whisper", {
          state: progress.state === "loading" ? "downloading" : "loading",
          progress: progress.progress,
        });
      }).then(() =>
        updateModel("whisper", {
          state: "ready",
          progress: 100,
          cached: true,
        })
      ),
      prepareKitchenSpeech((progress) => {
        updateModel("kokoro", {
          state: progress.state === "loading" ? "downloading" : "loading",
          progress: progress.progress,
        });
      }).then(() =>
        updateModel("kokoro", { state: "ready", progress: 100, cached: true })
      ),
    ];

    try {
      await Promise.all(preparations);
    } finally {
      unsubscribe();
    }
  });
  return preparationPromise;
}
