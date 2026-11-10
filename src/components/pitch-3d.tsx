"use client";

import dynamic from "next/dynamic";
import type { Pitch3DProps } from "./pitch-3d-scene";

export type { View, ViewInput } from "./pitch-3d-scene";

const Scene = dynamic(() => import("./pitch-3d-scene"), { ssr: false });

/** The 3D ground. The WebGL code only loads in the browser, and only when a pitch is shown. */
export function Pitch3D(props: Pitch3DProps) {
  return <Scene {...props} />;
}
