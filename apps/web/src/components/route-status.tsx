import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto mt-16 max-w-md border border-border bg-bg-2 px-6 py-10 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">
        {error instanceof Error ? error.message : "An unexpected error occurred."}
      </p>
      <Button className="mt-6" variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

export function RouteNotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md border border-border bg-bg-2 px-6 py-10 text-center">
      <h2 className="text-xl font-semibold">Page not found</h2>
      <p className="mt-2 text-sm text-muted">That page doesn&apos;t exist.</p>
      <Link to="/" className="mt-6 inline-block">
        <Button variant="outline">Back to decks</Button>
      </Link>
    </div>
  );
}

export function QueryError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center bg-relearning-bg text-relearning">
        <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-[40ch] text-sm text-muted">
        Check your connection and try again. Your saved data is safe.
      </p>
      <Button variant="outline" className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
