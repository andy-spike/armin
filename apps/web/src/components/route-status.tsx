import { Link, type ErrorComponentProps } from "@tanstack/react-router";
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
