import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { api } from "@armin/backend/api";
import type { Id } from "@armin/backend/types";
import {
  AgentGuardrails,
  AgentPermissionsFields,
  normalizePermissions,
  permissionsProblem,
  summarizePermissions,
  useDeckNames,
  type AgentPermissions,
} from "@/components/agent-permissions";
import { Section } from "@/components/settings-layout";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { convexClient, errorMessage } from "@/lib/armin-client";
import { useConnection } from "@/lib/session";
import { cn } from "@/lib/utils";

/** The Convex HTTP site serves the MCP endpoint, not the app origin. */
const MCP_ENDPOINT = `${String(import.meta.env.VITE_CONVEX_SITE_URL ?? "").replace(/\/$/, "")}/mcp`;

/** Hosted assistants need a public HTTPS address; development servers aren't one. */
const MCP_IS_PUBLIC = (() => {
  try {
    const { protocol, hostname } = new URL(MCP_ENDPOINT);
    return protocol === "https:" && hostname !== "localhost" && !hostname.endsWith(".localhost");
  } catch {
    return false;
  }
})();

const EXAMPLE_PROMPT =
  "Read this article and save a deck of study cards from it to Armin. Keep each card to one idea.";

/* ------------------------------------------------------------- helpers */

function formatWhen(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** A stable timestamp for accessible names; relative times would change under a screen reader. */
function formatExact(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function When({ timestamp }: { timestamp: number }) {
  return (
    <time dateTime={new Date(timestamp).toISOString()} title={new Date(timestamp).toLocaleString()}>
      {formatWhen(timestamp)}
    </time>
  );
}

function useCopy() {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const timeout = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timeout.current), []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({
        tone: "error",
        title: "Couldn’t copy",
        description: "Select the text and copy it yourself.",
      });
    }
  };
  return { copy, copied };
}

/* ------------------------------------------------------- connect guide */

type ClientGuide = {
  id: string;
  label: string;
  command?: (endpoint: string) => string[];
  steps: string[];
  note: string;
};

const CLIENTS: ClientGuide[] = [
  {
    id: "claude",
    label: "Claude",
    steps: [
      "Open Customize, then Connectors, and choose Add custom connector.",
      "Paste the address above and choose Add.",
      "Choose Connect, then approve access in Armin.",
    ],
    note: "On Team and Enterprise plans, an owner adds it first under Organization settings, then Connectors. Everyone else then chooses Connect on it.",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    steps: [
      "Open chatgpt.com/plugins, choose the plus button, and add a custom MCP server.",
      "Name it Armin and paste the address above under Connection.",
      "Pick OAuth when asked how to sign in, accept the risk warning, then approve access in Armin.",
    ],
    note: "Plans and workspace policies decide who can add a custom MCP server. In a workspace, an admin may need to allow it.",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    command: (endpoint) => [`claude mcp add --transport http armin ${endpoint}`],
    steps: [
      "Run this command in your terminal.",
      "In a Claude Code session, run /mcp, pick armin, and choose Authenticate.",
      "Approve access in the Armin page that opens.",
    ],
    note: "By default this applies to the current project. Add --scope user to use Armin from any project.",
  },
  {
    id: "codex",
    label: "Codex",
    command: (endpoint) => [`codex mcp add armin --url ${endpoint}`, "codex mcp login armin"],
    steps: [
      "Run these two commands in your terminal.",
      "Approve access in the Armin page that opens.",
    ],
    note: "If Codex doesn’t know the login command, update Codex.",
  },
];

function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const { copy, copied } = useCopy();
  const done = copied === text;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("shrink-0", className)}
        aria-label={label}
        onClick={() => void copy(text)}
      >
        {done ? <Check className="size-4 text-good" /> : <Copy className="size-4" />}
        Copy
      </Button>
      <span role="status" className="sr-only">
        {done ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}

function CodeLine({ text, label, wrap }: { text: string; label: string; wrap?: boolean }) {
  return (
    <div className={cn("flex gap-2", wrap ? "items-start" : "items-center")}>
      <code
        className={cn(
          "min-w-0 flex-1 border border-border bg-surface-sunken px-3 py-1.5 font-mono text-[0.8125rem] leading-6 text-ink select-all",
          wrap
            ? "break-words whitespace-pre-wrap"
            : "armin-scrollbar overflow-x-auto whitespace-nowrap",
        )}
      >
        {text}
      </code>
      <CopyButton text={text} label={label} />
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <div className="border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="text-sm font-medium text-ink">
        <span className="mr-2 font-mono text-[0.8125rem] text-accent-deep tabular-nums">
          {number}
        </span>
        {title}
      </h3>
      <div className="mt-2.5 pl-5">{children}</div>
    </div>
  );
}

function ConnectGuide({ another }: { another: boolean }) {
  const [clientId, setClientId] = useState(CLIENTS[0].id);
  const client = CLIENTS.find((candidate) => candidate.id === clientId) ?? CLIENTS[0];
  const commands = client.command?.(MCP_ENDPOINT);
  // Hosted assistants call Armin from the cloud; the command-line tools run on this computer.
  const cloudClient = !client.command;

  return (
    <Section
      title={another ? "Connect another assistant" : "Connect an assistant"}
      description="Your assistant reads the article, doc, or code and writes the cards. Armin stores them in your library."
    >
      <Step number={1} title="Copy Armin’s address">
        <CodeLine text={MCP_ENDPOINT} label="Copy Armin’s address" />
        <p className="mt-2 text-[0.8125rem] text-muted">
          This is a remote MCP server. Your assistant signs in to Armin through your browser, so you
          never paste a password or token.
        </p>
      </Step>

      <Step number={2} title="Add it to your assistant">
        <Segmented
          options={CLIENTS.map((candidate) => ({ value: candidate.id, label: candidate.label }))}
          value={clientId}
          onChange={setClientId}
          className="max-w-full flex-wrap"
        />
        <div className="mt-3 space-y-3" aria-live="polite">
          {commands && (
            <div className="space-y-2">
              {commands.map((command) => (
                <CodeLine key={command} text={command} label={`Copy command: ${command}`} />
              ))}
            </div>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink marker:text-muted">
            {client.steps.map((step) => (
              <li key={step} className="pl-1">
                {step}
              </li>
            ))}
          </ol>
          <p className="text-[0.8125rem] text-muted">{client.note}</p>
          {cloudClient && !MCP_IS_PUBLIC && (
            <p className="text-[0.8125rem] text-ink">
              Claude and ChatGPT connect from the cloud, so they can’t reach this address. It only
              works from tools running on this computer, such as Claude Code and Codex.
            </p>
          )}
          <p className="text-[0.8125rem] text-muted">
            Menus move around. If a step doesn’t match what you see, search your provider’s help for
            “custom connector” or “remote MCP server”.
          </p>
        </div>
      </Step>

      <Step number={3} title="Approve access and ask for a deck">
        <p className="text-sm text-ink">
          Armin shows what the assistant is asking for. The defaults are the safe ones: it can only
          use decks it creates, and it can’t edit anything you already have.
        </p>
        <p className="mt-3 text-[0.8125rem] text-muted">Then try something like:</p>
        <div className="mt-1.5">
          <CodeLine text={EXAMPLE_PROMPT} label="Copy example request" wrap />
        </div>
      </Step>
    </Section>
  );
}

/* ------------------------------------------------------- connections */

type Connection = NonNullable<
  ReturnType<typeof useConnectionsQuery>["data"]
>["connections"][number];

function useConnectionsQuery() {
  return useQuery(convexQuery(api.agents.connections, {}));
}

function toPermissions(connection: Connection): AgentPermissions {
  return {
    scope: connection.scope,
    deckIds: connection.deckIds,
    allowCreateDecks: connection.allowCreateDecks,
    allowEdits: connection.allowEdits,
  };
}

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div role="status" aria-busy>
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="border-b border-border px-4 py-3.5 last:border-b-0">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3.5 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function ConnectionRow({
  connection,
  deckNames,
  onManage,
  onRevoke,
}: {
  connection: Connection;
  deckNames: Map<string, string> | undefined;
  onManage: () => void;
  onRevoke: () => void;
}) {
  const revoked = connection.revokedAt !== undefined;
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-2 border-b border-border px-4 py-3.5 last:border-b-0 max-sm:grid-cols-1",
        revoked && "bg-surface-sunken",
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="truncate">{connection.name}</span>
          {revoked && (
            <span className="shrink-0 rounded-sm bg-bg-2 px-1.5 py-0.5 text-xs font-medium text-muted">
              Revoked
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[0.8125rem] text-muted">
          {summarizePermissions(toPermissions(connection), deckNames)}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {revoked && connection.revokedAt !== undefined ? (
            <>
              Access ended <When timestamp={connection.revokedAt} />
            </>
          ) : connection.lastUsedAt !== undefined ? (
            <>
              Last used <When timestamp={connection.lastUsedAt} />
            </>
          ) : (
            "Not used yet"
          )}
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          Connected <When timestamp={connection.createdAt} />
        </p>
      </div>
      {!revoked && (
        <div className="flex shrink-0 items-center gap-1.5 max-sm:justify-start">
          <Button
            variant="outline"
            size="sm"
            aria-label={`Manage ${connection.name}, connected ${formatExact(connection.createdAt)}`}
            onClick={onManage}
          >
            Manage
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-again hover:text-again-deep"
            aria-label={`Revoke ${connection.name}, connected ${formatExact(connection.createdAt)}`}
            onClick={onRevoke}
          >
            Revoke
          </Button>
        </div>
      )}
    </li>
  );
}

function ConnectionsSection() {
  const connections = useConnectionsQuery();
  const { byId: deckNames } = useDeckNames();
  const [managing, setManaging] = useState<{ connection: Connection; open: boolean } | null>(null);
  const [revoking, setRevoking] = useState<{ connection: Connection; open: boolean } | null>(null);

  const all = connections.data?.connections ?? [];
  const active = all.filter((connection) => connection.revokedAt === undefined);
  const revoked = all.filter((connection) => connection.revokedAt !== undefined);

  return (
    <Section
      title="Connected assistants"
      description="Each connection has its own access. Changes apply to its next request."
    >
      {connections.isLoading ? (
        <RowsSkeleton rows={2} />
      ) : connections.isError ? (
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <p className="text-sm text-muted">Couldn’t load your connections.</p>
          <Button variant="outline" size="sm" onClick={() => void connections.refetch()}>
            Try again
          </Button>
        </div>
      ) : all.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted">
          Nothing is connected yet. Add Armin’s address to an assistant above and it will appear
          here once you approve it.
        </p>
      ) : (
        <ul>
          {[...active, ...revoked].map((connection) => (
            <ConnectionRow
              key={connection._id}
              connection={connection}
              deckNames={deckNames}
              onManage={() => setManaging({ connection, open: true })}
              onRevoke={() => setRevoking({ connection, open: true })}
            />
          ))}
        </ul>
      )}

      {managing && (
        <ManageDialog
          key={managing.connection._id}
          connection={managing.connection}
          ended={
            all.find((candidate) => candidate._id === managing.connection._id)?.revokedAt !==
            undefined
          }
          open={managing.open}
          onClose={() => setManaging((current) => current && { ...current, open: false })}
          onExitComplete={() => setManaging(null)}
        />
      )}
      {revoking && (
        <RevokeDialog
          key={revoking.connection._id}
          connection={revoking.connection}
          open={revoking.open}
          onClose={() => setRevoking((current) => current && { ...current, open: false })}
          onExitComplete={() => setRevoking(null)}
        />
      )}
    </Section>
  );
}

function ManageDialog({
  connection,
  ended,
  open,
  onClose,
  onExitComplete,
}: {
  connection: Connection;
  /** The live list says this access was revoked while the dialog was open. */
  ended: boolean;
  open: boolean;
  onClose: () => void;
  onExitComplete: () => void;
}) {
  const toast = useToast();
  const { online } = useConnection();
  const [draft, setDraft] = useState(() => toPermissions(connection));
  const problem = permissionsProblem(draft);

  const save = useMutation({
    mutationFn: () =>
      convexClient().mutation(api.agents.updateConnection, {
        connectionId: connection._id as Id<"agentConnections">,
        ...normalizePermissions(draft),
      }),
    onSuccess: () => {
      toast({ tone: "success", title: "Access updated", description: connection.name });
      onClose();
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onExitComplete={onExitComplete}
      title={`Manage ${connection.name}`}
      description="Changes apply to its next request."
      className="max-w-lg"
      footer={
        <div className="flex flex-col gap-3">
          {ended ? (
            <p role="alert" className="text-[0.8125rem] text-ink">
              This assistant’s access was revoked, so it can’t be changed. It has to connect again.
            </p>
          ) : problem ? (
            <p role="alert" className="text-[0.8125rem] text-ink">
              {problem}
            </p>
          ) : (
            save.isError && (
              <p role="alert" className="text-[0.8125rem] text-again">
                {errorMessage(save.error, "Couldn’t update access. Try again.")}
              </p>
            )
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              busy={save.isPending}
              disabled={problem !== null || ended || !online}
              onClick={() => save.mutate()}
            >
              Save changes
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <AgentPermissionsFields
          value={draft}
          onChange={setDraft}
          disabled={save.isPending}
          showProblem={false}
        />
        <AgentGuardrails />
      </div>
    </Dialog>
  );
}

function RevokeDialog({
  connection,
  open,
  onClose,
  onExitComplete,
}: {
  connection: Connection;
  open: boolean;
  onClose: () => void;
  onExitComplete: () => void;
}) {
  const toast = useToast();
  const { online } = useConnection();

  const revoke = useMutation({
    mutationFn: () =>
      convexClient().mutation(api.agents.revoke, {
        connectionId: connection._id as Id<"agentConnections">,
      }),
    onSuccess: () => {
      toast({ tone: "success", title: "Access revoked", description: connection.name });
      onClose();
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onExitComplete={onExitComplete}
      title={`Revoke ${connection.name}?`}
      description="It loses access right away. Cards and decks it already saved stay in your library."
      footer={
        <div className="flex flex-col gap-3">
          {revoke.isError && (
            <p role="alert" className="text-[0.8125rem] text-again">
              {errorMessage(revoke.error, "Couldn’t revoke access. Try again.")}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              busy={revoke.isPending}
              disabled={!online}
              onClick={() => revoke.mutate()}
            >
              Revoke access
            </Button>
          </div>
        </div>
      }
    >
      <p className="text-sm text-muted">
        To use it again, connect it from the assistant and approve access once more.
      </p>
    </Dialog>
  );
}

/* ------------------------------------------------------------ activity */

const ACTIVITY_PAGE = 8;

function ActivitySection() {
  const connections = useConnectionsQuery();
  const { byId: deckNames } = useDeckNames();
  const [shown, setShown] = useState(ACTIVITY_PAGE);
  const activity = connections.data?.activity ?? [];

  return (
    <Section
      title="Activity"
      description="What your connected assistants have done in your library, newest first."
    >
      {connections.isLoading ? (
        <RowsSkeleton rows={3} />
      ) : connections.isError ? (
        <p className="px-4 py-5 text-sm text-muted">Couldn’t load activity.</p>
      ) : activity.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted">
          Nothing yet. When an assistant saves or changes something, it’s listed here.
        </p>
      ) : (
        <>
          <ul>
            {activity.slice(0, shown).map((entry) => {
              const deckName = entry.deckId ? deckNames.get(entry.deckId) : undefined;
              return (
                <li
                  key={entry._id}
                  className="border-b border-border px-4 py-3 text-sm last:border-b-0"
                >
                  <p className="text-ink">{entry.summary}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {entry.clientName}
                    <span aria-hidden> · </span>
                    <span className="sr-only">, </span>
                    <When timestamp={entry.createdAt} />
                    {entry.deckId && deckName && (
                      <>
                        <span aria-hidden> · </span>
                        <span className="sr-only">, </span>
                        <Link
                          to="/deck/$deckId"
                          params={{ deckId: entry.deckId }}
                          className="font-medium text-accent hover:text-accent-deep"
                        >
                          {deckName}
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          {activity.length > shown && (
            <div className="border-t border-border px-4 py-2.5">
              <Button variant="ghost" size="sm" onClick={() => setShown((count) => count + 20)}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/* --------------------------------------------------------------- panel */

/** The Settings > AI assistants tab: guided setup, connections, and activity. */
export function AgentSettings() {
  const connections = useConnectionsQuery();
  // Once something is connected, managing it matters more than setting up another.
  const hasActive = (connections.data?.connections ?? []).some(
    (connection) => connection.revokedAt === undefined,
  );
  return hasActive ? (
    <>
      <ConnectionsSection />
      <ActivitySection />
      <ConnectGuide another />
    </>
  ) : (
    <>
      <ConnectGuide another={false} />
      <ConnectionsSection />
      <ActivitySection />
    </>
  );
}
