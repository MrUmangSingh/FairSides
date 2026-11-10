"use client";

import { useEffect, useState } from "react";
import { signInMethods, supabase, type SignInMethods } from "@/lib/cloud";

/** Shown before the profile form when accounts are on and nobody is signed in. */
export function SignIn() {
  const [methods, setMethods] = useState<SignInMethods | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    signInMethods().then((m) => {
      if (live) setMethods(m);
    });
    return () => {
      live = false;
    };
  }, []);

  const back = () => `${window.location.origin}/profile`;

  async function run(work: () => Promise<{ error: { message: string } | null }>, done?: () => void) {
    setBusy(true);
    setError("");
    const { error: failed } = await work();
    setBusy(false);
    if (failed) setError(failed.message);
    else done?.();
  }

  const none = methods && !methods.google && !methods.guest && !methods.email;

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-12 px-5 py-14 lg:grid-cols-2 lg:py-24">
      <div>
        <h1 className="text-[clamp(2.2rem,5vw,4rem)] leading-[0.98]">Sign in to get your player card</h1>
        <p className="mt-5 max-w-[30rem] text-lg text-chalk-dim">
          Your profile and your matches follow you to any phone or laptop, and your friends see the same match
          you do.
        </p>
      </div>

      <div className="panel p-6 sm:p-8" aria-busy={!methods}>
        {!methods ? (
          <p className="text-chalk-dim">Checking how you can sign in…</p>
        ) : none ? (
          <p role="alert" className="text-warn">
            No sign-in method is switched on for this site yet. In the Supabase dashboard, open Authentication,
            then Sign In / Providers, and turn on Google or Anonymous sign-ins.
          </p>
        ) : (
          <div className="grid gap-4">
            {methods.google ? (
              <button
                type="button"
                className="btn w-full"
                disabled={busy}
                onClick={() =>
                  run(() => supabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: back() } }))
                }
              >
                Continue with Google
              </button>
            ) : null}
            {methods.guest ? (
              <div>
                <button
                  type="button"
                  className={`btn w-full ${methods.google ? "btn-line" : ""}`}
                  disabled={busy}
                  onClick={() => run(() => supabase().auth.signInAnonymously())}
                >
                  Continue as a guest
                </button>
                <p className="field-hint">No account needed. A guest profile stays on this device only.</p>
              </div>
            ) : null}
            {methods.email ? (
              sent ? (
                <p role="status" className="chalk-rule pt-4">
                  Check <strong>{email}</strong> for a sign-in link. Open it on this device and you&apos;ll land
                  back here.
                </p>
              ) : (
                <form
                  className={methods.google || methods.guest ? "chalk-rule pt-4" : ""}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!/^\S+@\S+\.\S+$/.test(email)) {
                      setError("Enter your email address, like name@example.com.");
                      return;
                    }
                    run(
                      () => supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: back() } }),
                      () => setSent(true),
                    );
                  }}
                  noValidate
                >
                  <label htmlFor="signin-email" className="field-label">
                    Email me a sign-in link
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <input
                      id="signin-email"
                      type="email"
                      className="input min-w-0 flex-1"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <button type="submit" className={`btn ${methods.google || methods.guest ? "btn-line" : ""}`} disabled={busy}>
                      Send link
                    </button>
                  </div>
                </form>
              )
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-warn">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
