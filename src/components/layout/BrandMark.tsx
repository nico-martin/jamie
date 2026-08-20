import { Sparkles } from "lucide-react";

interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="grid size-9 place-items-center rounded-full bg-paprika text-cream">
        <Sparkles size={17} strokeWidth={2.2} />
      </span>
      <span className="font-display text-2xl font-bold tracking-[-0.04em]">
        Jamie
      </span>
    </div>
  );
}
