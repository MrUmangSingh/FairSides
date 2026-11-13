/**
 * Loading state: the two bib colours from the logo circling each other under a
 * floodlight glow. Server-safe, so it can be used in loading.tsx and Suspense
 * fallbacks as well as client screens.
 *
 * `compact` drops the full-height frame for use inside a section or panel.
 */
export function PageLoader({ label = "Loading", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={
        compact
          ? "loader-compact flex flex-col items-center justify-center gap-4 py-12"
          : "flex min-h-[60vh] flex-col items-center justify-center gap-7 px-5"
      }
    >
      <div className="loader-orbit" aria-hidden>
        <span className="loader-glow" />
        <span className="loader-dot bg-bib-a" />
        <span className="loader-dot loader-dot-b bg-bib-b" />
      </div>
      {label ? (
        <p className="loader-label text-sm font-semibold tracking-[0.2em] text-chalk-dim uppercase">{label}</p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}

/** A small ring for buttons that are waiting on the network. */
export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`spinner ${className}`} />;
}
