interface BrandMarkProps {
  className?: string;
}

export default function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/favicon.svg" alt="" className="size-9" />
      <span className="font-display text-2xl font-bold tracking-[-0.04em]">
        Jamie
      </span>
    </div>
  );
}
