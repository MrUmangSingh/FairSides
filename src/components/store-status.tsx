"use client";

import { actions, useStore } from "@/lib/store";

/** A change that didn't save, said once, in a bar the visitor can dismiss. */
export function SaveError() {
  const { error } = useStore();
  if (!error) return null;
  return (
    <div
      role="alert"
      className="panel fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl items-center gap-4 border-warn/50 bg-panel/95 p-4"
    >
      <p className="min-w-0 flex-1 text-sm">
        <strong className="text-warn">That didn&apos;t save.</strong> {error}
      </p>
      <button type="button" className="btn btn-line btn-sm" onClick={() => actions.clearError()}>
        Dismiss
      </button>
    </div>
  );
}

export function StorageNote() {
  const { cloud } = useStore();
  return (
    <>
      {cloud
        ? "Fairsides. Your profile and matches are saved to your account and update live for everyone in the match."
        : "Fairsides keeps everything in this browser. Add Supabase keys to switch on accounts and shared matches."}
    </>
  );
}
