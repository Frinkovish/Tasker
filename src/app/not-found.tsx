import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          There&apos;s nothing at this address.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 inline-flex min-h-(--control-h-sm) items-center text-sm underline underline-offset-4"
        >
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
