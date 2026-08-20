import {
  CheckCircle2,
  CloudDownload,
  HardDrive,
  LoaderCircle,
} from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import {
  getAppModelsStatus,
  inspectAppModels,
  subscribeToAppModelsStatus,
  type AppModelStatus,
} from "../../services/modelManager";
import AppHeader from "../layout/AppHeader";
import PromptComposer from "./PromptComposer";

interface BuilderScreenProps {
  isGenerating: boolean;
  generationError?: string | null;
  onGenerate: (prompt: string) => void;
  className?: string;
}

export default function BuilderScreen({
  isGenerating,
  generationError = null,
  onGenerate,
  className = "",
}: BuilderScreenProps) {
  const modelsStatus = useSyncExternalStore(
    subscribeToAppModelsStatus,
    getAppModelsStatus
  );

  useEffect(() => {
    void inspectAppModels().catch(() => undefined);
  }, []);

  const allModelsCached = modelsStatus.models.every((model) => model.cached);
  const isPreparing = modelsStatus.models.some(
    (model) => model.state === "downloading" || model.state === "loading"
  );
  const isChecking = modelsStatus.models.some(
    (model) => model.state === "checking"
  );

  return (
    <div
      className={`builder-surface min-h-screen overflow-hidden ${className}`}
    >
      <AppHeader onHome={() => undefined} />
      <main className="relative mx-auto grid min-h-[calc(100vh-88px)] max-w-360 items-center px-5 pb-16 md:px-10 lg:px-14">
        <div className="recipe-scribble" aria-hidden="true">
          good food,
          <br /> made yours
        </div>
        <div className="relative z-10 mx-auto w-full max-w-3xl py-14 text-center md:py-20">
          <span className="mb-5 inline-block text-xs font-bold uppercase tracking-[0.22em] text-sage-dark">
            Your personal recipe studio
          </span>
          <h1 className="font-display text-[3.15rem] font-semibold leading-[0.95] tracking-[-0.055em] text-ink sm:text-6xl md:text-[5.4rem]">
            What are you
            <br /> craving today?
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink/58 md:text-lg">
            Tell us what sounds good. We’ll shape your idea into a thoughtful,
            step-by-step recipe made for your table.
          </p>
          <PromptComposer
            isGenerating={isGenerating}
            onGenerate={onGenerate}
            className="mt-9 text-left"
          />
          <div
            aria-live="polite"
            className="mx-auto mt-4 max-w-2xl rounded-2xl border border-ink/10 bg-white/65 px-4 py-3.5 text-left shadow-[0_10px_30px_rgba(74,58,38,0.06)] backdrop-blur"
          >
            <div className="flex items-center gap-3 border-b border-ink/8 pb-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sage/12 text-sage-dark">
                {isChecking || isPreparing ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : allModelsCached ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <HardDrive size={17} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-ink">
                  {isChecking
                    ? "Checking local model files"
                    : isPreparing
                      ? "Preparing local AI models"
                      : allModelsCached
                        ? "All models are cached"
                        : "Model download required"}
                </p>
                <p className="mt-0.5 text-[11px] text-ink/48">
                  Models load together when you create a recipe.
                </p>
              </div>
            </div>
            <div className="mt-2 divide-y divide-ink/7">
              {modelsStatus.models.map((model) => (
                <ModelStatusRow key={model.id} model={model} />
              ))}
            </div>
          </div>
          {generationError && (
            <p className="mx-auto mt-4 max-w-xl rounded-2xl border border-paprika/20 bg-white/65 px-4 py-3 text-sm text-paprika">
              Could not generate the recipe: {generationError}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex >= 3 ? 2 : 1)} ${units[unitIndex]}`;
}

function ModelStatusRow({ model }: { model: AppModelStatus }) {
  const active = model.state === "downloading" || model.state === "loading";
  const size = model.cached
    ? `${formatBytes(model.totalBytes)} cached`
    : `${model.hasUnknownSize ? "at least " : ""}${formatBytes(model.downloadBytes)} download`;

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="text-sage-dark">
          {model.state === "checking" || active ? (
            <LoaderCircle className="animate-spin" size={14} />
          ) : model.cached ? (
            <CheckCircle2 size={14} />
          ) : model.state === "error" ? (
            <HardDrive size={14} />
          ) : (
            <CloudDownload size={14} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-bold text-ink">{model.name}</p>
            <p className="shrink-0 font-mono text-[10px] text-ink/45">
              {model.state === "checking"
                ? "Checking..."
                : model.state === "error"
                  ? "Unavailable"
                  : size}
            </p>
          </div>
          <p className="text-[10px] text-ink/40">
            {model.error ?? model.purpose}
          </p>
        </div>
      </div>
      {active && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/8">
          <div
            className="h-full rounded-full bg-sage transition-[width] duration-200"
            style={{ width: `${model.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
