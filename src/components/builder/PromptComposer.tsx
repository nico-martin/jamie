import { ArrowUp, LoaderCircle, WandSparkles } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button, TextArea } from "../../theme";

interface PromptComposerProps {
  initialPrompt?: string;
  isGenerating?: boolean;
  onGenerate: (prompt: string) => void;
  className?: string;
}

export default function PromptComposer({
  initialPrompt = "pepperoni pizza with homemade dough",
  isGenerating = false,
  onGenerate,
  className = "",
}: PromptComposerProps) {
  const [prompt, setPrompt] = useState(initialPrompt);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (prompt.trim()) onGenerate(prompt.trim());
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-4xl border border-ink/10 bg-white/80 p-3 shadow-[0_25px_70px_rgba(74,58,38,0.12)] backdrop-blur md:p-4 ${className}`}
    >
      <div className="flex items-center gap-2 px-3 pt-2 text-xs font-bold uppercase tracking-[0.16em] text-paprika">
        <WandSparkles size={15} /> Recipe idea
      </div>
      <TextArea
        rows={4}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="A cozy vegetarian lasagne with mushrooms, lots of herbs, and a crispy top..."
        aria-label="Describe the recipe you want"
        className="px-3 py-4 md:min-h-36 md:px-4"
      />
      <div className="flex items-center justify-between gap-3 border-t border-ink/8 px-1 pt-3 md:px-2">
        <span className="hidden text-sm text-ink/45 sm:block">
          Be as specific or spontaneous as you like.
        </span>
        <Button
          type="submit"
          disabled={!prompt.trim() || isGenerating}
          className="ml-auto px-5"
        >
          {isGenerating ? (
            <>
              <LoaderCircle className="animate-spin" size={17} /> Building
            </>
          ) : (
            <>
              Create recipe <ArrowUp size={17} />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
