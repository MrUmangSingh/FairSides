"use client";

import { useState } from "react";
import type { Player } from "@/lib/domain/types";
import { Pitch } from "./pitch";
import { Pitch3D, type View } from "./pitch-3d";

// On a tall screen the pitch is turned end-on so it still fills the frame.
const turn = (v: View) => (aspect: number) => (aspect < 1 ? { ...v, az: v.az + Math.PI / 2 } : v);
const VIEWS = {
  stand: { label: "Stand", view: turn({ az: 0, pol: 0.8, zoom: 0.92 }) },
  above: { label: "Above", view: turn({ az: 0, pol: 0.14, zoom: 1.04 }) },
  goal: { label: "Behind goal", view: () => ({ az: Math.PI / 2, pol: 1.12, zoom: 1 }) },
} as const;
type ViewId = keyof typeof VIEWS;

/** The match's teams on the 3D ground, with camera presets and a flat fallback. */
export function TeamStage({ a, b, label }: { a: Player[]; b: Player[]; label: string }) {
  const [viewId, setViewId] = useState<ViewId>("stand");
  const [flat, setFlat] = useState(false);

  return (
    <div className="stage aspect-[4/5] sm:aspect-[16/9]">
      {flat ? (
        <div className="grid h-full place-items-center p-4 pt-16">
          <div className="h-full" style={{ aspectRatio: "2 / 3" }}>
            <Pitch a={a} b={b} label={label} />
          </div>
        </div>
      ) : (
        <Pitch3D a={a} b={b} label={label} view={VIEWS[viewId].view} drag className="absolute inset-0" />
      )}

      <div className="absolute inset-x-3 top-3 flex flex-wrap items-center justify-between gap-2">
        <div className="seg" role="group" aria-label="Camera">
          {(Object.keys(VIEWS) as ViewId[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={!flat && viewId === id}
              onClick={() => {
                setViewId(id);
                setFlat(false);
              }}
            >
              {VIEWS[id].label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Flat pitch">
          <button type="button" aria-pressed={flat} onClick={() => setFlat((f) => !f)}>
            Flat
          </button>
        </div>
      </div>
      {flat ? null : (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-chalk-dim">
          Drag to look around
        </p>
      )}
    </div>
  );
}
