import type { TextareaHTMLAttributes } from "react";
import cn from "../../utils/classnames";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

export default function TextArea({ className = "", ...props }: TextAreaProps) {
  return (
    <textarea
      className={cn(
        "w-full resize-none bg-transparent text-lg leading-relaxed text-ink outline-none md:text-xl",
        className
      )}
      {...props}
    />
  );
}
