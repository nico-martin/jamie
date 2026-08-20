import { Minus, Plus } from "lucide-react";
import { IconButton } from "../../theme";

interface ServingsControlProps {
  servings: number;
  onChange: (servings: number) => void;
  className?: string;
}

export default function ServingsControl({
  servings,
  onChange,
  className = "",
}: ServingsControlProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <IconButton
        label="Decrease servings"
        onClick={() => onChange(Math.max(1, servings - 1))}
        className="size-8 bg-transparent"
      >
        <Minus size={14} />
      </IconButton>
      <span className="min-w-16 text-center text-sm font-bold">
        {servings} servings
      </span>
      <IconButton
        label="Increase servings"
        onClick={() => onChange(servings + 1)}
        className="size-8 bg-transparent"
      >
        <Plus size={14} />
      </IconButton>
    </div>
  );
}
