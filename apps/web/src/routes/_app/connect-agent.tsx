import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { ShieldQuestion } from "lucide-react";
import { api } from "@armin/backend/api";
import { AgentAccess } from "@/components/agent-access";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { convexClient, errorMessage } from "@/lib/armin-client";
import { useConnection } from "@/lib/session";

type ConnectAgentSearch = { request?: string };

/** Only follow redirects that leave the page the ordinary way. */
function isNavigableUrl(value: string) {
  try {
    const { protocol } = new URL(value);
    return !["javascript:", "data:", "vbscript:", "blob:", "file:"].includes(protocol);
  } catch {
    return false;
  }
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-xl pb-16">{children}</div>;
}

function Notice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <PageShell>
      <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">{title}</h1>
      <p className="mt-2 max-w-[60ch] text-sm text-muted">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </PageShell>
  );
}

const toSettings = (
  <Link to="/settings" search={{ tab: "assistants" }}>
    <Button variant="outline">Go to AI assistants</Button>
  </Link>
);

function ConnectAgentPage() {
  const { request } = Route.useSearch();

  if (!request) {
    return (
      <Notice
        title="This link is incomplete"
        body="Start the connection again from your assistant. If you’re setting one up, Settings has the address to add."
        action={toSettings}
      />
    );
  }
  return <Consent key={request} requestId={request} />;
}

function Consent({ requestId }: { requestId: string }) {
  const { online } = useConnection();
  const authorization = useQuery(convexQuery(api.agents.authorization, { requestId }));
  const [leaving, setLeaving] = useState(false);

  const leave = (redirectUrl: string) => {
    if (!isNavigableUrl(redirectUrl)) throw new Error("Armin got an unusable return address.");
    // Stay busy while the browser leaves; a second click must not send a second answer.
    setLeaving(true);
    window.location.assign(redirectUrl);
  };

  const approve = useMutation({
    mutationFn: () => convexClient().action(api.agents.approve, { requestId }),
    onSuccess: ({ redirectUrl }) => leave(redirectUrl),
  });
  const deny = useMutation({
    mutationFn: () => convexClient().mutation(api.agents.deny, { requestId }),
    onSuccess: ({ redirectUrl }) => leave(redirectUrl),
  });

  if (authorization.isLoading) {
    return (
      <PageShell>
        <div role="status" aria-busy>
          <span className="sr-only">Loading the connection request</span>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
            Connect an AI assistant
          </h1>
          <Skeleton className="mt-4 h-5 w-2/3" />
          <Skeleton className="mt-8 h-72 w-full rounded-none" />
        </div>
      </PageShell>
    );
  }
  if (authorization.isError) {
    return (
      <Notice
        title="Couldn’t load this request"
        body="Check your connection and try again."
        action={
          <Button variant="outline" onClick={() => void authorization.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const request = authorization.data;
  if (!request) {
    return (
      <Notice
        title="This request has expired"
        body="Connection requests are only valid for a few minutes, and each can be used once. Start the connection again from your assistant."
        action={toSettings}
      />
    );
  }

  const working = approve.isPending || deny.isPending || leaving;
  const failure = approve.error ?? deny.error;

  return (
    <PageShell>
      <header>
        <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
          Connect an AI assistant
        </h1>
        <p className="mt-2 max-w-[60ch] text-sm text-muted">
          Review who is asking and what it can do. You can disconnect it later in Settings.
        </p>
      </header>

      <section aria-labelledby="requester" className="mt-8 border border-border bg-surface">
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-2">
            <h2 id="requester" className="truncate font-serif text-lg font-semibold text-ink">
              {request.clientName}
            </h2>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border-strong bg-bg-2 px-1.5 py-0.5 text-xs font-medium text-ink">
              <ShieldQuestion className="size-3" aria-hidden />
              Unverified
            </span>
          </div>
          <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">
            The app chose this name itself, and Armin hasn’t checked it. Continue only if you just
            started this connection.
          </p>
        </div>
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-medium text-muted">After you choose, you’ll go to</p>
          <p className="mt-0.5 font-mono text-[0.8125rem] break-all text-ink">
            {request.redirectOrigin}
          </p>
        </div>
      </section>

      <AgentAccess className="mt-6" />

      {failure && (
        <p
          role="alert"
          className="mt-5 border border-again/40 bg-again/10 px-3.5 py-2.5 text-sm text-ink"
        >
          {errorMessage(
            failure,
            "Couldn’t complete the connection. The request may have expired; start again from your assistant.",
          )}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          busy={approve.isPending || (leaving && approve.isSuccess)}
          disabled={working || !online}
          onClick={() => approve.mutate()}
        >
          Allow access
        </Button>
        <Button
          variant="outline"
          busy={deny.isPending || (leaving && deny.isSuccess)}
          disabled={working}
          onClick={() => deny.mutate()}
        >
          Deny
        </Button>
        <p className="text-xs text-muted">Connection requests expire after a few minutes.</p>
      </div>
    </PageShell>
  );
}

export const Route = createFileRoute("/_app/connect-agent")({
  validateSearch: (search: Record<string, unknown>): ConnectAgentSearch => ({
    request: typeof search.request === "string" && search.request ? search.request : undefined,
  }),
  head: () => ({ meta: [{ title: "Connect an AI assistant · Armin" }] }),
  component: ConnectAgentPage,
});
