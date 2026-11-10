/**
 * Full-height loading state: the two bib colours from the logo circling each
 * other under a floodlight glow. Server-safe, so it can be used in loading.tsx
 * and Suspense fallbacks as well as client screens.
 */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-7 px-5"
    >
      <div className="loader-orbit" aria-hidden>
        <span className="loader-glow" />
        <span className="loader-dot bg-bib-a" />
        <span className="loader-dot loader-dot-b bg-bib-b" />
      </div>
      <p className="loader-label text-sm font-semibold tracking-[0.2em] text-chalk-dim uppercase">{label}</p>
    </div>
  );
}
