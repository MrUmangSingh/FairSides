"use client";

import { useEffect, useState } from "react";
import { PageLoader, Spinner } from "@/components/page-loader";
import { signInMethods, supabase, type SignInMethods } from "@/lib/cloud";

type Method = "google" | "guest" | "email";

/** Shown before the profile form when accounts are on and nobody is signed in. */
export function SignIn() {
  const [methods, setMethods] = useState<SignInMethods | null>(null);
  const [email, setEmail] = useState("");
  // Which sign-in is in flight, so only that button shows a spinner.
  const [busy, setBusy] = useState<Method | null>(null);
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

  async function run(which: Method, work: () => Promise<{ error: { message: string } | null }>, done?: () => void) {
    setBusy(which);
    setError("");
    const { error: failed } = await work();
    // A successful Google sign-in navigates away, so keep its spinner until the page leaves.
    if (failed || which !== "google") setBusy(null);
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
          <PageLoader label="Checking sign-in options" compact />
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
                disabled={busy !== null}
                onClick={() =>
                  run("google", () =>
                    supabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: back() } }),
                  )
                }
              >
                {busy === "google" ? <Spinner /> : null}
                {busy === "google" ? "Opening Google…" : "Continue with Google"}
              </button>
            ) : null}
            {methods.guest ? (
              <div>
                <button
                  type="button"
                  className={`btn w-full ${methods.google ? "btn-line" : ""}`}
                  disabled={busy !== null}
                  onClick={() => run("guest", () => supabase().auth.signInAnonymously())}
                >
                  {busy === "guest" ? <Spinner /> : null}
                  {busy === "guest" ? "Setting you up…" : "Continue as a guest"}
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
                      "email",
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
                    <button type="submit" className={`btn ${methods.google || methods.guest ? "btn-line" : ""}`} disabled={busy !== null}>
                      {busy === "email" ? <Spinner /> : null}
                      {busy === "email" ? "Sending…" : "Send link"}
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
