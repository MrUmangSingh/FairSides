"use client";

import { useEffect, useRef, useState } from "react";
import type { Match } from "@/lib/domain/types";
import { formatFee, formatSize, formatWhen } from "@/lib/format";

// The match the host has just created in this tab, so its page can open with the link up front.
let justCreated: string | null = null;
export const markCreated = (id: string) => {
  justCreated = id;
};

/**
 * The match's link, which is all anyone needs to open it and join (private matches included:
 * they are only kept out of the list). Big and first right after the host creates the match,
 * a single row after that.
 */
export function ShareMatch({ match, placesLeft }: { match: Match; placesLeft: number }) {
  const [fresh, setFresh] = useState(() => justCreated === match.id);
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // The match page only renders in the browser, after the store has loaded, so these are safe.
  const canShare = typeof navigator.share === "function";
  const url = `${window.location.origin}/matches/${match.id}`;
  const text = [
    `Join ${match.title} on Fairsides`,
    `${formatWhen(match.datetime)} at ${match.venue}`,
    `${formatSize(match.perSide)}, ${formatFee(match.fee).toLowerCase()}, ${
      placesLeft > 0 ? `${placesLeft} ${placesLeft === 1 ? "place" : "places"} left` : "full, join the waitlist"
    }`,
  ].join("\n");

  useEffect(() => {
    // Only the first visit after creating counts as fresh.
    return () => {
      if (justCreated === match.id) justCreated = null;
    };
  }, [match.id]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard access (an http page or a blocked permission): select it to copy by hand.
      field.current?.select();
    }
  }

  async function share() {
    try {
      await navigator.share({ title: match.title, text, url });
    } catch {
      // Closing the share sheet rejects too; nothing to do.
    }
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;

  const controls = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
      <input
        ref={field}
        className="input min-w-0 flex-1 basis-60 py-2 text-sm"
        value={url}
        readOnly
        aria-label="Match link"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className={`btn ${fresh ? "" : "btn-sm"}`} onClick={copy} aria-live="polite">
        {copied ? "Copied" : "Copy link"}
      </button>
      {canShare ? (
        <button type="button" className={`btn btn-line ${fresh ? "" : "btn-sm"}`} onClick={share}>
          Share
        </button>
      ) : null}
      <a className={`btn btn-line ${fresh ? "" : "btn-sm"}`} href={whatsapp} target="_blank" rel="noreferrer">
        WhatsApp
      </a>
    </div>
  );

  if (fresh) {
    return (
      <section aria-labelledby="share-heading" className="panel mt-8 border-glow/50 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 id="share-heading" className="text-2xl">
              Match created. Send this link to your players
            </h2>
            <p className="mt-2 text-sm text-chalk-dim">
              Anyone with the link can open the match and join it
              {match.visibility === "private" ? ". It's private, so it won't show in the list of matches" : ""}.
              The link is also at the top of this page whenever you need it again.
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-chalk-dim underline underline-offset-4 hover:text-chalk"
            onClick={() => setFresh(false)}
          >
            Done
          </button>
        </div>
        <div className="mt-5">{controls}</div>
      </section>
    );
  }

  return (
    <section aria-label="Invite players" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <h2 className="font-sans text-sm font-semibold text-chalk-dim">Invite players</h2>
      {controls}
    </section>
  );
}
