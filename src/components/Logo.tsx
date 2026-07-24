// VeriPay brand mark — a "V" that doubles as a verification check.
// Pure black & white, flips automatically with the theme.

export default function Logo({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-label="VeriPay logo" role="img">
      <rect width="64" height="64" rx="16" className="fill-zinc-900 dark:fill-white" />
      <path
        d="M17 27 L29 45 L47 19"
        className="stroke-white dark:stroke-black"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
