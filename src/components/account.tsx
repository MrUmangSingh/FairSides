"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { tierColor } from "@/components/player-card";
import { takeAuthError } from "@/lib/cloud";
import { ovrFor } from "@/lib/domain/ratings";
import { POSITION_LABELS, STAT_KEYS, STAT_LABELS, type Player } from "@/lib/domain/types";
import { actions, useStore } from "@/lib/store";

export function GoogleMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Avatar({ player, src, className = "size-7" }: { player: Player; src: string | null; className?: string }) {
  if (src) {
    // A remote Google picture; next/image would need the host allow-listed for a 28px avatar.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" referrerPolicy="no-referrer" className={`${className} rounded-full object-cover`} />;
  }
  const overall = Math.round(ovrFor(player.stats, player.gk, player.primaryPos));
  return (
    <span
      aria-hidden
      className={`${className} grid place-items-center rounded-full font-display text-xs font-extrabold text-turf-deep`}
      style={{ background: tierColor(overall) }}
    >
      {player.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * Google sends people back with the reason on the URL when linking fails.
 * Read it once per page load (the read also tidies the URL).
 */
let bounced: string | null | undefined;
function redirectError() {
  if (bounced === undefined) bounced = takeAuthError();
  return bounced;
}

/**
 * Where a guest learns their profile is stuck on this device and can link
 * Google to keep it. Once linked it just says which account they're using.
 */
export function AccountPanel({ readRedirect = false, compact = false }: { readRedirect?: boolean; compact?: boolean }) {
  const { account } = useStore();
  const [busy, setBusy] = useState(false);
  // Only rendered after hydration, so reading the URL here is safe.
  const [bounce, setBounce] = useState(() => (readRedirect ? redirectError() : null));

  if (!account) return null;

  if (!account.guest) {
    return (
      <div className={compact ? "" : "account-panel p-4"}>
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/95">
            <GoogleMark className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              Google connected
              <svg viewBox="0 0 16 16" className="size-3.5 text-glow" aria-hidden>
                <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </p>
            {account.email ? <p className="truncate text-xs text-chalk-dim">{account.email}</p> : null}
          </div>
        </div>
        {!compact ? (
          <p className="field-hint mt-3">Your card and matches follow you to any phone or laptop you sign in on.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={compact ? "" : "account-panel account-panel-guest p-4"}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="size-2 rounded-full bg-warn shadow-[0_0_10px_var(--color-warn)]" aria-hidden />
        Playing as a guest
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-chalk-dim">
        Your card only lives on this device. Connect Google to keep it, and your matches, on any phone or laptop.
      </p>
      <button
        type="button"
        className="btn btn-google mt-3 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setBounce(null);
          bounced = null;
          await actions.connectGoogle();
          // Still here means it failed; on success the browser has already left for Google.
          setBusy(false);
        }}
      >
        <GoogleMark />
        {busy ? "Opening Google…" : "Connect with Google"}
      </button>
      {bounce ? (
        <p role="alert" className="mt-3 text-xs text-warn">
          {bounce}
        </p>
      ) : null}
    </div>
  );
}

/** The player's name in the header; opens their card, account and settings. */
export function AccountMenu({ me }: { me: Player }) {
  const { cloud, account } = useStore();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const pathname = usePathname();

  // Navigating away closes it.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const overall = Math.round(ovrFor(me.stats, me.gk, me.primaryPos));
  const guest = cloud && account?.guest;

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        className="btn btn-line btn-sm relative gap-2 pl-1.5"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar player={me} src={account?.avatar ?? null} />
        <span className="max-w-[9rem] truncate">{me.name}</span>
        <svg viewBox="0 0 12 12" className={`size-3 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {guest ? (
          <>
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-turf bg-warn" aria-hidden />
            <span className="sr-only">(guest account)</span>
          </>
        ) : null}
      </button>

      {open ? (
        <div id={menuId} role="dialog" aria-label="Your account" className="account-menu">
          <div className="mini-card" style={{ ["--tier" as string]: tierColor(overall) }}>
            <div className="flex items-start gap-3">
              <div className="font-display text-5xl font-extrabold leading-[0.85] tabular-nums text-[var(--tier)]">
                {overall}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="truncate font-display text-lg font-extrabold leading-tight">{me.name}</p>
                <p className="text-xs text-chalk-dim">
                  {POSITION_LABELS[me.primaryPos]}
                  {me.secondaryPos ? ` · ${POSITION_LABELS[me.secondaryPos]}` : ""}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-2">
              {STAT_KEYS.map((k) => (
                <div key={k} className="min-w-0">
                  <dt className="truncate text-[0.65rem] uppercase tracking-wider text-chalk-dim">{STAT_LABELS[k]}</dt>
                  <dd className="font-display text-base font-bold tabular-nums">{me.stats[k]}</dd>
                </div>
              ))}
            </dl>
          </div>

          {cloud ? (
            <section className="px-4 pt-4" aria-label="Account">
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-chalk-dim">Account</p>
              <AccountPanel compact />
            </section>
          ) : null}

          <nav className="mt-3 grid border-t border-white/10 p-2 text-sm" aria-label="Profile">
            <Link href="/profile" className="account-menu-item" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 20 20" className="size-4 opacity-70" aria-hidden>
                <rect x="4" y="2.5" width="12" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7 13.5h6M8 7.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Edit player card
            </Link>
            <Link href="/matches" className="account-menu-item" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 20 20" className="size-4 opacity-70" aria-hidden>
                <rect x="2.5" y="4" width="15" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 4v12M2.5 8h2.5v4H2.5M17.5 8H15v4h2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              My matches
            </Link>
            <button type="button" className="account-menu-item text-left" onClick={() => actions.signOut()}>
              <svg viewBox="0 0 20 20" className="size-4 opacity-70" aria-hidden>
                <path d="M8 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h3M12.5 13.5 16 10l-3.5-3.5M16 10H8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {cloud ? "Sign out" : "Switch player"}
            </button>
          </nav>
          {guest ? (
            <p className="px-4 pb-3 text-[0.7rem] leading-snug text-chalk-dim">
              Signing out as a guest loses this card for good.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
