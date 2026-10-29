import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** The Convex HTTP site serves the MCP endpoint, not the app origin. */
export const MCP_ENDPOINT = `${String(import.meta.env.VITE_CONVEX_SITE_URL ?? "").replace(/\/$/, "")}/mcp`;

/** Hosted assistants need a public HTTPS address; development servers aren't one. */
const MCP_IS_PUBLIC = (() => {
  try {
    const { protocol, hostname } = new URL(MCP_ENDPOINT);
    return (
      protocol === "https:" &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      !hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
})();

const EXAMPLE_PROMPT =
  "Read this article and save a deck of study cards from it to Armin. Keep each card to one idea.";

/* ------------------------------------------------------------- copying */

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

function CopyButton({ text, label }: { text: string; label: string }) {
  const { copy, copied } = useCopy();
  const done = copied === text;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 shrink-0"
        aria-label={label}
        onClick={() => void copy(text)}
      >
        {/* Both icons share one cell so the check crossfades in over the copy icon. */}
        <span className="grid size-4 *:col-start-1 *:row-start-1" aria-hidden>
          <Copy
            className={cn(
              "size-4 transition-[opacity,scale] duration-150 ease-(--ease-out)",
              done && "scale-80 opacity-0",
            )}
          />
          <Check
            className={cn(
              "size-4 text-good transition-[opacity,scale] duration-150 ease-(--ease-out)",
              !done && "scale-80 opacity-0",
            )}
          />
        </span>
        Copy
      </Button>
      <span role="status" className="sr-only">
        {done ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}

/**
 * One copyable line. Long commands wrap instead of scrolling, so the box never
 * grows a scrollbar, and both the box and the button are h-9 on one line.
 */
function CodeLine({ text, label, wrap }: { text: string; label: string; wrap?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <code
        className={cn(
          "min-h-9 min-w-0 flex-1 border border-border bg-surface-sunken px-3 py-[5px] font-mono text-[0.8125rem] leading-6 whitespace-pre-wrap text-ink select-all",
          wrap ? "break-words" : "break-all",
        )}
      >
        {text}
      </code>
      <CopyButton text={text} label={label} />
    </div>
  );
}

/** A long, multi-line block (an agent prompt) with its copy button above it. */
function CodeBlock({ text, label }: { text: string; label: string }) {
  return (
    <div className="border border-border bg-surface-sunken">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5">
        <span className="text-xs font-medium text-muted">Prompt</span>
        <CopyButton text={text} label={label} />
      </div>
      <pre className="max-h-80 overflow-auto px-3 py-2.5 font-mono text-[0.8125rem] leading-6 break-words whitespace-pre-wrap text-ink">
        {text}
      </pre>
    </div>
  );
}

/* --------------------------------------------------------------- guides */

type ChatGuide = {
  kind: "chat";
  id: string;
  label: string;
  steps: ReactNode[];
  /** Who can add a custom server; one short line under the steps. */
  note: string;
  /**
   * Armin's listing in the app's plugin directory. Flip `listed` once the
   * directory approves and publishes the plugin. See plugins/PUBLISHING.md.
   */
  directory?: { listed: boolean; url: string; name: string; steps: ReactNode[] };
};

type AgentGuide = {
  kind: "agent";
  id: string;
  label: string;
  prompt: (endpoint: string) => string;
  commands: (endpoint: string) => string[];
  /** What to do after running the commands by hand. */
  after: ReactNode;
};

type Guide = ChatGuide | AgentGuide;

const allow = (
  <>
    Choose <b>Allow access</b> on the Armin page that opens.
  </>
);

const CLAUDE: ChatGuide = {
  kind: "chat",
  id: "claude",
  label: "Claude",
  directory: {
    listed: false,
    url: "https://claude.ai/customize/plugins",
    name: "Claude’s plugins",
    steps: [
      <>
        In Claude, open <b>Customize → Plugins</b> and find Armin.
      </>,
      <>
        Choose <b>Add</b>, then <b>Connect</b> in the plugin’s Connectors tab.
      </>,
      allow,
    ],
  },
  steps: [
    <>
      Open <ExternalLink href="https://claude.ai">claude.ai</ExternalLink> and go to{" "}
      <b>Customize → Connectors</b>.
    </>,
    <>
      Choose <b>+</b>, then <b>Add custom connector</b>.
    </>,
    <>
      Name it <b>Armin</b>, paste the server address, and choose <b>Add</b>.
    </>,
    <>
      Choose <b>Connect</b>. {allow}
    </>,
    <>
      In a chat, turn on Armin from the <b>+</b> menu.
    </>,
  ],
  note: "On Team and Enterprise plans, an owner adds Armin first.",
};

const CHATGPT: ChatGuide = {
  kind: "chat",
  id: "chatgpt",
  label: "ChatGPT",
  directory: {
    listed: false,
    url: "https://chatgpt.com/plugins",
    name: "ChatGPT’s plugins",
    steps: [
      <>
        Open <b>Plugins</b> in ChatGPT and find Armin.
      </>,
      <>
        Choose <b>Add</b>.
      </>,
      allow,
    ],
  },
  steps: [
    <>
      Open <ExternalLink href="https://chatgpt.com/plugins">chatgpt.com/plugins</ExternalLink>.
    </>,
    <>
      Choose <b>+</b>, then <b>Add custom MCP server</b>.
    </>,
    <>
      Name it <b>Armin</b> and paste the server address.
    </>,
    <>
      Pick <b>OAuth</b>, accept the warning, and choose <b>Create as a plugin</b>.
    </>,
    allow,
    <>
      In a chat, type <b>@</b> and pick Armin.
    </>,
  ],
  note: "Your plan or workspace admin must allow custom MCP servers.",
};

const GEMINI: ChatGuide = {
  kind: "chat",
  id: "gemini",
  label: "Gemini",
  steps: [
    <>
      Open <ExternalLink href="https://gemini.google.com">gemini.google.com</ExternalLink> on a
      computer.
    </>,
    <>
      Go to <b>Settings → Connected Apps</b>.
    </>,
    <>
      Under <b>Custom apps</b>, choose <b>Add a custom app</b>.
    </>,
    <>
      Paste the server address and choose <b>Next</b>.
    </>,
    allow,
  ],
  note: "Needs a personal Google account, in the US, with Keep Activity on. Works in the Gemini app too once added.",
};

const CLAUDE_CODE: AgentGuide = {
  kind: "agent",
  id: "claude-code",
  label: "Claude Code",
  prompt: (endpoint) =>
    [
      "Set up the Armin MCP server for me:",
      "",
      `1. Run: claude mcp add --transport http --scope user armin ${endpoint}`,
      "   (If armin already exists, remove it with `claude mcp remove armin --scope user` first.)",
      "2. Run `claude mcp list` to check it was added.",
      "3. Tell me to type /mcp, pick armin, choose Authenticate, and allow access in the browser. If armin isn't listed in /mcp, tell me to restart Claude Code first.",
      "",
      "Armin uses browser sign-in. Don't ask me for a password or token.",
    ].join("\n"),
  commands: (endpoint) => [`claude mcp add --transport http --scope user armin ${endpoint}`],
  after: (
    <>
      Then type <b>/mcp</b> in Claude Code, pick <b>armin</b>, and choose <b>Authenticate</b>.
    </>
  ),
};

const CODEX: AgentGuide = {
  kind: "agent",
  id: "codex",
  label: "Codex",
  prompt: (endpoint) =>
    [
      "Set up the Armin MCP server for me:",
      "",
      `1. Run: codex mcp add armin --url ${endpoint}`,
      "   (If armin already exists, remove it with `codex mcp remove armin` first.)",
      "2. Run `codex mcp login armin`. It opens my browser; wait while I allow access.",
      "3. Run `codex mcp list` to check it's signed in.",
      "4. Tell me to start a new Codex session.",
      "",
      "If your sandbox blocks these commands, ask me to approve them.",
      "Armin uses browser sign-in. Don't ask me for a password or token.",
    ].join("\n"),
  commands: (endpoint) => [`codex mcp add armin --url ${endpoint}`, "codex mcp login armin"],
  after: "Allow access in the browser, then start a new Codex session.",
};

const GUIDES: Guide[] = [CLAUDE, CHATGPT, GEMINI, CLAUDE_CODE, CODEX];

/** Every tab value: the guides above, in order, then the generic MCP client guide. */
export const AI_SETUP_PLATFORMS = [
  "claude",
  "chatgpt",
  "gemini",
  "claude-code",
  "codex",
  "other",
] as const;

/* ------------------------------------------------------------ building blocks */

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-accent underline-offset-2 hover:text-accent-deep hover:underline"
    >
      {children}
    </a>
  );
}

function Steps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3 text-sm leading-6 text-ink">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-2 font-mono text-xs text-accent-deep tabular-nums"
          >
            {index + 1}
          </span>
          <span className="min-w-0">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[0.8125rem] text-muted">{children}</p>;
}

function LocalOnlyNotice() {
  if (MCP_IS_PUBLIC) return null;
  return (
    <p className="border border-hard/40 bg-hard/10 px-3 py-2 text-[0.8125rem] text-ink">
      Chat apps can’t reach this local server. Use armincards.app to connect them.
    </p>
  );
}

/* --------------------------------------------------------------- panels */

function ChatPanel({ guide }: { guide: ChatGuide }) {
  const directory = guide.directory?.listed ? guide.directory : undefined;
  return (
    <div className="space-y-5">
      <LocalOnlyNotice />
      <Steps steps={directory ? directory.steps : guide.steps} />
      {directory ? (
        <a
          href={directory.url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Open {directory.name}
        </a>
      ) : (
        <Note>{guide.note}</Note>
      )}
    </div>
  );
}

function AgentPanel({ guide }: { guide: AgentGuide }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink">
        Paste this into {guide.label}. It sets everything up and tells you when to sign in.
      </p>
      <CodeBlock text={guide.prompt(MCP_ENDPOINT)} label={`Copy the ${guide.label} setup prompt`} />
      <details className="details-reveal group text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Or run it yourself</summary>
        <div className="mt-3 space-y-2">
          {guide.commands(MCP_ENDPOINT).map((command) => (
            <CodeLine key={command} text={command} label={`Copy command: ${command}`} />
          ))}
          <p className="pt-1 text-ink">{guide.after}</p>
        </div>
      </details>
    </div>
  );
}

function OtherClientPanel() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink">
        Any app that supports remote MCP servers can connect. Use these settings:
      </p>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Address</dt>
        <dd className="text-ink">The server address above</dd>
        <dt className="text-muted">Transport</dt>
        <dd className="text-ink">Streamable HTTP</dd>
        <dt className="text-muted">Sign-in</dt>
        <dd className="text-ink">OAuth (no API key needed)</dd>
      </dl>
      <Note>When your app opens Armin, choose Allow access.</Note>
    </div>
  );
}

/* --------------------------------------------------------------- page */

export type AiSetupPlatform = (typeof AI_SETUP_PLATFORMS)[number];

/** The AI setup page body: the server address, a guide per platform, and next steps. */
export function AiSetupGuide({
  platform,
  onPlatformChange,
}: {
  platform: AiSetupPlatform;
  onPlatformChange: (platform: AiSetupPlatform) => void;
}) {
  return (
    <div className="max-w-2xl space-y-10">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Server address</h2>
        <CodeLine text={MCP_ENDPOINT} label="Copy Armin’s MCP server address" />
      </section>

      <Tabs
        value={platform}
        onValueChange={(value) => onPlatformChange(value as AiSetupPlatform)}
        className="gap-6"
      >
        <TabsList aria-label="AI platform" className="border-b border-border">
          {GUIDES.map((guide) => (
            <TabsTab key={guide.id} value={guide.id}>
              {guide.label}
            </TabsTab>
          ))}
          <TabsTab value="other">Other</TabsTab>
        </TabsList>

        {GUIDES.map((guide) => (
          <TabsPanel key={guide.id} value={guide.id}>
            {guide.kind === "chat" ? <ChatPanel guide={guide} /> : <AgentPanel guide={guide} />}
          </TabsPanel>
        ))}
        <TabsPanel value="other">
          <OtherClientPanel />
        </TabsPanel>
      </Tabs>

      <section className="space-y-2 border-t border-border pt-8">
        <h2 className="text-sm font-semibold text-ink">Then try</h2>
        <CodeLine text={EXAMPLE_PROMPT} label="Copy example request" wrap />
        <Note>
          Manage connections in{" "}
          <Link
            to="/settings"
            search={{ tab: "assistants" }}
            className="font-medium text-accent underline-offset-2 hover:text-accent-deep hover:underline"
          >
            Settings
          </Link>
          .
        </Note>
      </section>
    </div>
  );
}
