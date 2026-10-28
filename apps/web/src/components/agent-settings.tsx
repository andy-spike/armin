import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { api } from "@armin/backend/api";
import { AgentLimits } from "@/components/agent-access";
import { Section } from "@/components/settings-layout";
import { Button, buttonVariants } from "@/components/ui/button";
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
  steps: string[];
  note: string;
} & (
  | {
      /** Chat apps install Armin's plugin from their directory. */
      kind: "chat";
      directory: {
        /** Flip once the directory approves and publishes the plugin. See plugins/PUBLISHING.md. */
        listed: boolean;
        url: string;
        name: string;
        steps: string[];
        note: string;
      };
    }
  | {
      /** Coding agents connect to the MCP server from the terminal. */
      kind: "agent";
      command: (endpoint: string) => string[];
    }
);

const CLIENTS: ClientGuide[] = [
  {
    id: "claude",
    label: "Claude",
    kind: "chat",
    directory: {
      listed: false,
      url: "https://claude.ai/customize/plugins",
      name: "Claude’s plugins",
      steps: [
        "Open Customize, then Plugins, and find Armin under Discover.",
        "Choose Add, open the plugin’s Connectors tab, and choose Connect.",
        "Approve access in the Armin page that opens.",
      ],
      note: "The plugin directory is on Pro, Max, Team, and Enterprise plans. On Team and Enterprise, an owner may need to add the Armin connector before you can connect it.",
    },
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
    kind: "chat",
    directory: {
      listed: false,
      url: "https://chatgpt.com/plugins",
      name: "ChatGPT’s plugins",
      steps: [
        "Open Plugins in ChatGPT and search for Armin.",
        "Choose Add, then sign in when ChatGPT asks.",
        "Approve access in the Armin page that opens.",
      ],
      note: "In a workspace, an admin decides which plugins members can add.",
    },
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
    kind: "agent",
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
    kind: "agent",
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

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-ink marker:text-muted">
      {steps.map((step) => (
        <li key={step} className="pl-1">
          {step}
        </li>
      ))}
    </ol>
  );
}

function AddressLine() {
  return (
    <div>
      <CodeLine text={MCP_ENDPOINT} label="Copy Armin’s address" />
      <p className="mt-2 text-[0.8125rem] text-muted">
        This is Armin’s remote MCP server. Your assistant signs in to Armin through your browser, so
        you never paste a password or token.
      </p>
    </div>
  );
}

/** Claude and ChatGPT install the plugin; until it is listed, they use the address directly. */
function ChatClientSetup({ client }: { client: Extract<ClientGuide, { kind: "chat" }> }) {
  const { directory } = client;
  if (directory.listed)
    return (
      <>
        <StepList steps={directory.steps} />
        <a
          href={directory.url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Open {directory.name}
        </a>
        <p className="text-[0.8125rem] text-muted">{directory.note}</p>
      </>
    );
  return (
    <>
      <p className="text-sm text-ink">
        Armin’s {client.label} plugin is waiting for directory review. Until it’s listed, add Armin
        by its address:
      </p>
      <AddressLine />
      <StepList steps={client.steps} />
      <p className="text-[0.8125rem] text-muted">{client.note}</p>
      {!MCP_IS_PUBLIC && (
        <p className="text-[0.8125rem] text-ink">
          {client.label} connects from the cloud, so it can’t reach this address. It only works from
          tools running on this computer, such as Claude Code and Codex.
        </p>
      )}
      <p className="text-[0.8125rem] text-muted">
        Menus move around. If a step doesn’t match what you see, search your provider’s help for
        “custom connector” or “remote MCP server”.
      </p>
    </>
  );
}

function AgentClientSetup({ client }: { client: Extract<ClientGuide, { kind: "agent" }> }) {
  return (
    <>
      <AddressLine />
      <div className="space-y-2">
        {client.command(MCP_ENDPOINT).map((command) => (
          <CodeLine key={command} text={command} label={`Copy command: ${command}`} />
        ))}
      </div>
      <StepList steps={client.steps} />
      <p className="text-[0.8125rem] text-muted">{client.note}</p>
    </>
  );
}

function ConnectGuide({ another }: { another: boolean }) {
  const [clientId, setClientId] = useState(CLIENTS[0].id);
  const client = CLIENTS.find((candidate) => candidate.id === clientId) ?? CLIENTS[0];

  return (
    <Section
      title={another ? "Connect another assistant" : "Connect an assistant"}
      description="Your assistant reads the article, doc, or code and writes the cards. Armin stores them in your library."
    >
      <Step number={1} title="Pick your assistant">
        <Segmented
          options={CLIENTS.map((candidate) => ({ value: candidate.id, label: candidate.label }))}
          value={clientId}
          onChange={setClientId}
          className="max-w-full flex-wrap"
        />
        <p className="mt-2 text-[0.8125rem] text-muted">
          Claude and ChatGPT add Armin inside the app. Claude Code and Codex connect to Armin’s MCP
          server from your terminal.
        </p>
      </Step>

      <Step
        number={2}
        title={
          client.kind === "chat" && client.directory.listed ? "Add the Armin plugin" : "Add Armin"
        }
      >
        <div className="space-y-3" aria-live="polite">
          {client.kind === "chat" ? (
            <ChatClientSetup client={client} />
          ) : (
            <AgentClientSetup client={client} />
          )}
        </div>
      </Step>

      <Step number={3} title="Approve access and ask for a deck">
        <p className="text-sm text-ink">
          Armin asks you to approve one level of access: all nine tools on your whole library. You
          can disconnect the assistant at any time in Settings.
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

/** Deck names for activity links. Access itself covers the whole library. */
function useDeckNames() {
  const decks = useQuery(convexQuery(api.decks.listNames, {}));
  return useMemo(
    () => new Map((decks.data ?? []).map((deck) => [deck.id as string, deck.name])),
    [decks.data],
  );
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
  onDisconnect,
}: {
  connection: Connection;
  onDisconnect: () => void;
}) {
  const ended = connection.revokedAt !== undefined;
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-2 border-b border-border px-4 py-3.5 last:border-b-0 max-sm:grid-cols-1",
        ended && "bg-surface-sunken",
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="truncate">{connection.name}</span>
          {ended && (
            <span className="shrink-0 rounded-sm bg-bg-2 px-1.5 py-0.5 text-xs font-medium text-muted">
              Disconnected
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[0.8125rem] text-muted">Whole library · all nine tools</p>
        <p className="mt-0.5 text-xs text-muted">
          {ended && connection.revokedAt !== undefined ? (
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
      {!ended && (
        <div className="flex shrink-0 items-center gap-1.5 max-sm:justify-start">
          <Button
            variant="ghost"
            size="sm"
            className="text-again hover:text-again-deep"
            aria-label={`Disconnect ${connection.name}, connected ${formatExact(connection.createdAt)}`}
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        </div>
      )}
    </li>
  );
}

function ConnectionsSection() {
  const connections = useConnectionsQuery();
  const [disconnecting, setDisconnecting] = useState<{
    connection: Connection;
    open: boolean;
  } | null>(null);

  const all = connections.data?.connections ?? [];
  const active = all.filter((connection) => connection.revokedAt === undefined);
  const ended = all.filter((connection) => connection.revokedAt !== undefined);

  return (
    <Section
      title="Connected assistants"
      description="Every approved assistant can use all nine tools on your whole library. Disconnecting ends access immediately; saved cards and decks stay."
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
          Nothing is connected yet. Add Armin to an assistant above and it will appear here once you
          approve it.
        </p>
      ) : (
        <ul>
          {[...active, ...ended].map((connection) => (
            <ConnectionRow
              key={connection._id}
              connection={connection}
              onDisconnect={() => setDisconnecting({ connection, open: true })}
            />
          ))}
        </ul>
      )}
      <AgentLimits className="border-t border-border px-4 py-3.5" />

      {disconnecting && (
        <DisconnectDialog
          key={disconnecting.connection._id}
          connection={disconnecting.connection}
          open={disconnecting.open}
          onClose={() => setDisconnecting((current) => current && { ...current, open: false })}
          onExitComplete={() => setDisconnecting(null)}
        />
      )}
    </Section>
  );
}

function DisconnectDialog({
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

  const disconnect = useMutation({
    mutationFn: () =>
      convexClient().mutation(api.agents.revoke, {
        connectionId: connection._id,
      }),
    onSuccess: () => {
      toast({ tone: "success", title: "Assistant disconnected", description: connection.name });
      onClose();
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onExitComplete={onExitComplete}
      title={`Disconnect ${connection.name}?`}
      description="It loses access right away. Cards and decks it already saved stay in your library."
      footer={
        <div className="flex flex-col gap-3">
          {disconnect.isError && (
            <p role="alert" className="text-[0.8125rem] text-again">
              {errorMessage(disconnect.error, "Couldn’t disconnect the assistant. Try again.")}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              busy={disconnect.isPending}
              disabled={!online}
              onClick={() => disconnect.mutate()}
            >
              Disconnect
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
  const deckNames = useDeckNames();
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
  // Once something is connected, seeing and disconnecting it matters more than setting up another.
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
