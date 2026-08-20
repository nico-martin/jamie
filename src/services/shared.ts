import {
  ModelRegistry,
  pipeline,
  type TextGenerationPipeline,
} from "@huggingface/transformers";
import gemma4 from "@huggingface/webgpu-models/gemma4";

let generatorPromise: Promise<TextGenerationPipeline> | null = null;
let downloadInfoPromise: Promise<DownloadInfo> | null = null;
let lastDownloadProgress = -1;

export interface DownloadInfo {
  cachedFiles: number;
  downloadBytes: number;
  files: number;
  hasUnknownSize: boolean;
  totalBytes: number;
}

export interface ModelLoadStatus extends DownloadInfo {
  state: "checking" | "ready" | "downloading" | "loading" | "error";
  progress: number;
  error?: string;
}

const EMPTY_DOWNLOAD_INFO: DownloadInfo = {
  cachedFiles: 0,
  downloadBytes: 0,
  files: 0,
  hasUnknownSize: false,
  totalBytes: 0,
};

let modelLoadStatus: ModelLoadStatus = {
  ...EMPTY_DOWNLOAD_INFO,
  state: "checking",
  progress: 0,
};
const modelLoadListeners = new Set<() => void>();

function updateModelLoadStatus(status: ModelLoadStatus) {
  modelLoadStatus = status;
  modelLoadListeners.forEach((listener) => listener());
}

export function getModelLoadStatus(): ModelLoadStatus {
  return modelLoadStatus;
}

export function subscribeToModelLoadStatus(listener: () => void) {
  modelLoadListeners.add(listener);
  return () => modelLoadListeners.delete(listener);
}

export async function getDownloadInfo(refresh = false): Promise<DownloadInfo> {
  if (refresh) downloadInfoPromise = null;
  downloadInfoPromise ??= ModelRegistry.get_pipeline_files(
    "text-generation",
    gemma4,
    {
      device: "webgpu",
      dtype: "auto",
    }
  ).then(async (files) => {
    const metadata = await Promise.all(
      files.map((file) => ModelRegistry.get_file_metadata(gemma4, file))
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
      hasUnknownSize: uncached.some((file) => file.size === undefined),
      totalBytes: existing.reduce((total, file) => total + (file.size ?? 0), 0),
    };
  });
  return downloadInfoPromise;
}

export async function inspectModelDownload(): Promise<DownloadInfo> {
  updateModelLoadStatus({
    ...modelLoadStatus,
    state: "checking",
    error: undefined,
  });

  try {
    const info = await getDownloadInfo();
    updateModelLoadStatus({
      ...info,
      state: "ready",
      progress: info.cachedFiles === info.files ? 100 : 0,
    });
    return info;
  } catch (error) {
    updateModelLoadStatus({
      ...EMPTY_DOWNLOAD_INFO,
      state: "error",
      progress: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function getTextGenerationPipeline(): Promise<TextGenerationPipeline> {
  generatorPromise ??= getDownloadInfo()
    .then((info) => {
      updateModelLoadStatus({
        ...info,
        state: info.cachedFiles === info.files ? "loading" : "downloading",
        progress: info.cachedFiles === info.files ? 100 : 0,
      });

      return pipeline("text-generation", gemma4, {
        device: "webgpu",
        dtype: "auto",
        progress_callback: (progress) => {
          if (progress.status === "ready") {
            updateModelLoadStatus({
              cachedFiles: modelLoadStatus.files,
              downloadBytes: 0,
              files: modelLoadStatus.files,
              hasUnknownSize: false,
              totalBytes: modelLoadStatus.totalBytes,
              state: "ready",
              progress: 100,
            });
            void getDownloadInfo(true);
            return;
          }
          if (progress.status !== "progress_total") return;

          const percent = Math.floor(progress.progress);
          updateModelLoadStatus({
            ...modelLoadStatus,
            state: percent >= 100 ? "loading" : "downloading",
            progress: percent,
          });
          if (percent === lastDownloadProgress) return;

          lastDownloadProgress = percent;
          console.log("download_progress", `${percent}%`);
        },
      });
    })
    .catch((error) => {
      updateModelLoadStatus({
        ...modelLoadStatus,
        state: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      generatorPromise = null;
      throw error;
    });
  return generatorPromise;
}
