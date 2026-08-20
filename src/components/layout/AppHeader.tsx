import BrandMark from "./BrandMark";

interface AppHeaderProps {
  onHome: () => void;
  className?: string;
}

export default function AppHeader({ onHome, className = "" }: AppHeaderProps) {
  return (
    <header
      className={`mx-auto flex w-full max-w-360 items-center justify-between px-5 py-5 md:px-10 lg:px-14 ${className}`}
    >
      <button onClick={onHome} aria-label="Go to recipe builder">
        <BrandMark />
      </button>
    </header>
  );
}
