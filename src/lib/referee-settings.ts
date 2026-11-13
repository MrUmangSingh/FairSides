"use client";

import { useSyncExternalStore } from "react";
import { blowWhistle, buzz, type WhistleCall } from "@/lib/whistle";

/** How the referee's phone behaves. Kept on this device only. */
export interface RefereeSettings {
  sound: boolean;
  /** 0 to 1. */
  volume: number;
  vibrate: boolean;
  /** Whistle when the clock starts, and two short when it's paused. */
  onClock: boolean;
  /** Whistle when a goal or card is recorded. */
  onEvents: boolean;
  halfTime: boolean;
  fullTime: boolean;
  /** Stop the clock by itself at half time. */
  pauseAtHalf: boolean;
}

export const DEFAULT_SETTINGS: RefereeSettings = {
  sound: true,
  volume: 0.8,
  vibrate: true,
  onClock: true,
  onEvents: false,
  halfTime: true,
  fullTime: true,
  pauseAtHalf: false,
};

const KEY = "fairsides:referee-settings";
const listeners = new Set<() => void>();
let current: RefereeSettings | null = null;

function load(): RefereeSettings {
  if (current) return current;
  let saved: Partial<RefereeSettings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {}
  current = { ...DEFAULT_SETTINGS, ...saved };
  return current;
}

export function setRefereeSettings(patch: Partial<RefereeSettings>) {
  current = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useRefereeSettings(): RefereeSettings {
  return useSyncExternalStore(subscribe, load, () => DEFAULT_SETTINGS);
}

/** Blows the whistle (and buzzes) as the settings allow. */
export function whistle(call: WhistleCall, s: RefereeSettings = load()) {
  if (s.sound) blowWhistle(call, s.volume);
  if (s.vibrate) buzz(call);
}
