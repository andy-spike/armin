import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { CloudOff, Layers, Library, Settings } from "lucide-react";
import { useScope } from "@/keybindings/keybindings-provider";
import { KeyboardOverlays } from "@/components/keyboard-overlays";
import { PageSkeleton } from "@/components/page-skeletons";
import { ReviewNavLink, ReviewNavLinkPlaceholder } from "@/components/review-nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { convexClient, errorMessage } from "@/lib/armin-client";
import { authClient } from "@/lib/auth-client";
import { useConnection, useViewer } from "@/lib/session";
import { installNoSpellcheck } from "@/lib/disable-spellcheck";
import { api } from "@armin/backend/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context }) => {
    if (!context.isAuthenticated) throw redirect({ to: "/sign-in" });
  },
  component: AppLayout,
});

const navLink =
  "-mb-px flex h-14 items-center gap-1.5 border-b-2 border-b-transparent px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-4";
const navLinkActive =
  "-mb-px flex h-14 items-center gap-1.5 border-b-2 !border-b-accent px-3 text-sm font-medium text-accent transition-colors duration-150 hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-4";

function detectTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Signed-in frame. Provisions the account's single library on first visit
 * (idempotent on the server), then renders the study app.
 */
function AppLayout() {
  const viewer = useViewer();
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const provisioning = useRef(false);

  useEffect(() => {
    installNoSpellcheck();
  }, []);

  const data = viewer.data;
  useEffect(() => {
    if (!data || data.library || !data.emailVerified || provisioning.current) return;
    provisioning.current = true;
    convexClient()
      .mutation(api.account.ensureLibrary, { timeZone: detectTimeZone() })
      .catch((error) => setProvisionError(errorMessage(error, "Couldn't set up your library.")))
      .finally(() => {
        provisioning.current = false;
      });
  }, [data]);

  if (viewer.isLoading) return <Shell loading="Loading your library" />;
  if (viewer.isError || data === null) {
    return (
      <FullPageMessage
        title="You're signed out"
        body="Your session ended. Sign in again to continue."
        action={
          <Button onClick={() => window.location.assign("/sign-in")}>Sign in</Button>
        }
      />
    );
  }
  if (!data) return <Shell loading="Loading your library" />;
  if (!data.emailVerified) {
    return (
      <FullPageMessage
        title="Verify your email"
        body={`Open the link we sent to ${data.email} to start saving study data.`}
        action={<SignOutButton />}
      />
    );
  }
  if (data.library?.status === "deleting") {
    return (
      <FullPageMessage
        title="This account is being deleted"
        body="Study data can't be changed while deletion finishes."
        action={<SignOutButton />}
      />
    );
  }
  if (!data.library) {
    return provisionError ? (
      <FullPageMessage title="Couldn't set up your library" body={provisionError} action={<SignOutButton />} />
    ) : (
      <Shell loading="Setting up your library" />
    );
  }
  return <Shell />;
}

function SignOutButton() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        void authClient.signOut().finally(() => window.location.assign("/sign-in"))
      }
    >
      Sign out
    </Button>
  );
}

function FullPageMessage({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="notebook-bg flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm border border-border bg-surface px-6 py-10 text-center">
        <h1 className="text-lg font-semibold" aria-live="polite">{title}</h1>
        {body && <p className="mt-2 text-sm text-muted">{body}</p>}
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

function ConnectionBanner() {
  const { online, pending } = useConnection();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-hard/40 bg-hard/15 px-4 py-1.5 text-center text-xs text-ink"
    >
      <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {pending
        ? "Offline. Your last change is waiting for the connection; its result will show when you're back."
        : "Offline. Reconnecting… Saving and reviewing are paused until the connection returns."}
    </div>
  );
}

/**
 * The signed-in app frame. With `loading`, the account isn't ready yet, so the
 * header renders without live counts and the page area shows the skeleton of
 * the page being opened; the real page then fills the same layout.
 */
function Shell({ loading }: { loading?: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [optimisticPathname, setOptimisticPathname] = useState<string | null>(null);
  const activePathname = optimisticPathname ?? pathname;

  useEffect(() => {
    if (optimisticPathname === pathname) setOptimisticPathname(null);
  }, [optimisticPathname, pathname]);

  const navClass = (path: string, exact = false) => {
    const active = exact
      ? activePathname === path
      : activePathname === path || activePathname.startsWith(`${path}/`);
    return active ? navLinkActive : navLink;
  };

  const navigate = useNavigate();
  const activateNav = (path: string) => flushSync(() => setOptimisticPathname(path));

  useScope("global", {
    "nav.decks": () => {
      activateNav("/");
      void navigate({ to: "/" });
    },
    "nav.browse": () => {
      activateNav("/browse");
      void navigate({ to: "/browse" });
    },
    "nav.review": () => {
      activateNav("/review");
      void navigate({ to: "/review" });
    },
    "nav.settings": () => {
      activateNav("/settings");
      void navigate({ to: "/settings" });
    },
  });

  const keyActivate = (event: KeyboardEvent<HTMLAnchorElement>, path: string) => {
    if (event.key === "Enter" || event.key === " ") activateNav(path);
  };

  const navItems = [
    { to: "/", label: "Decks", Icon: Layers, exact: true },
    { to: "/browse", label: "Browse", Icon: Library, exact: false },
    { to: "/settings", label: "Settings", Icon: Settings, exact: false },
  ] as const;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="z-30 flex h-14 w-full shrink-0 items-stretch justify-between border-b border-border bg-bg sm:grid sm:grid-cols-[1fr_auto_1fr]">
        <Link
          to="/"
          className="hidden h-14 items-center justify-self-start px-6 font-serif text-xl font-semibold tracking-tight text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:flex"
        >
          Armin
        </Link>
        <nav className="flex items-stretch justify-self-center" aria-label="Main">
          {navItems.map(({ to, label, Icon, exact }) => (
            <Link
              key={to}
              to={to}
              className={navClass(to, exact)}
              onPointerDown={(event) => {
                if (event.button === 0) activateNav(to);
              }}
              onKeyDown={(event) => keyActivate(event, to)}
              aria-label={label}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-self-end">
          <ThemeToggle />
          {loading ? <ReviewNavLinkPlaceholder /> : <ReviewNavLink />}
        </div>
      </header>
      <ConnectionBanner />
      <main className="route-view flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            "route-scroll armin-scrollbar armin-scrollbar-gutter-bg notebook-bg min-h-0 flex-1 overflow-y-auto",
          )}
        >
          <div className="route-pad mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
            {loading ? (
              <div role="status" aria-busy className="h-full">
                <span className="sr-only">{loading}</span>
                <PageSkeleton pathname={activePathname} />
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </div>
      </main>
      <KeyboardOverlays />
    </div>
  );
}

