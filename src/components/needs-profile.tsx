import Link from "next/link";

export function NeedsProfile({ action }: { action: string }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <h1 className="text-3xl">Create your player profile first</h1>
      <p className="mt-4 text-chalk-dim">
        You need a profile to {action}. It takes about a minute: your name, your position and six
        sliders.
      </p>
      <Link href="/profile" className="btn mt-6">
        Create profile
      </Link>
    </div>
  );
}
