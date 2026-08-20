import { X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import cn from "../../utils/classnames";
import IconButton from "../icon-button/IconButton";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className = "",
  contentClassName = "",
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeModal = useEffectEvent(onClose);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-ink/65 p-4 backdrop-blur-sm md:p-8"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] bg-cream-light text-ink shadow-[0_30px_100px_rgba(0,0,0,0.35)]",
          className
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-ink/10 px-5 py-4 md:px-6">
          <div>
            <h2 id={titleId} className="font-display text-2xl font-bold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs text-ink/45">
                {description}
              </p>
            )}
          </div>
          <IconButton
            ref={closeButtonRef}
            label={`Close ${title}`}
            onClick={onClose}
            className="bg-white"
          >
            <X size={18} />
          </IconButton>
        </header>
        <div className={cn("min-h-0 flex-1 overflow-auto", contentClassName)}>
          {children}
        </div>
      </section>
    </div>,
    document.body
  );
}
