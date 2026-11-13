"use client";

import dynamic from "next/dynamic";
import { PageLoader } from "./page-loader";
import type { Pitch3DProps } from "./pitch-3d-scene";

export type { View, ViewInput } from "./pitch-3d-scene";

// Both callers place the pitch absolutely inside a positioned frame, so the
// loader fills that same frame while three.js downloads.
const Scene = dynamic(() => import("./pitch-3d-scene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center">
      <PageLoader label="" compact />
    </div>
  ),
});

/** The 3D ground. The WebGL code only loads in the browser, and only when a pitch is shown. */
export function Pitch3D(props: Pitch3DProps) {
  return <Scene {...props} />;
}
