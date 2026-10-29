import { useEffect, useRef, useState } from "react";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouter,
  useMatches,
  useRouterState,
} from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { flushSync } from "react-dom";
import { CloudOff } from "lucide-react";
import { useKeybindings, useScope } from "@/keybindings/keybindings-provider";
import { isStepsPrefix, parseBinding } from "@/lib/keybindings/keys";
import { KeyboardOverlays } from "@/components/keyboard-overlays";
import { PageSkeleton } from "@/components/page-skeletons";
import { AppSidebar } from "@/components/app-sidebar";
import { ArminMark, ArminWordmark } from "@/components/brand";
import { StudyClockSync } from "@/components/study-clock-sync";
import { LandingPage } from "@/components/landing/landing-page";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  clampSidebarWidth,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { convexClient, errorMessage } from "@/lib/armin-client";
import { signOutToSignIn, useSigningOut } from "@/lib/auth-client";
import { useConnection, useViewer } from "@/lib/session";
import { installNoSpellcheck } from "@/lib/disable-spellcheck";
import { api } from "@armin/backend/api";

/**
 * The sidebar's saved open state, from the cookie its toggle writes. Read on the
 * server too, so a collapsed sidebar doesn't flash open during hydration.
 */
const readSidebarOpen = createIsomorphicFn()
  .server(() => getCookie("sidebar_state") !== "false")
  .client(() => !document.cookie.split(";").includes("sidebar_state=false"));

/** The sidebar's saved width in px, from the cookie its rail writes when dragged. */
const readSidebarWidth = createIsomorphicFn()
  .server(() => clampSidebarWidth(Number(getCookie("sidebar_width") ?? Number.NaN)))
  .client(() => {
    const saved = document.cookie.split(";").find((cookie) => cookie.startsWith("sidebar_width="));
    return clampSidebarWidth(Number(saved?.slice("sidebar_width=".length) ?? Number.NaN));
  });

export const Route = createFileRoute("/_app")({
  // The frame (sidebar and the opened page's skeleton) renders on the server so
  // it paints with the HTML; the pages inside it still render in the browser.
  ssr: true,
  beforeLoad: ({ context, location }) => {
    // Signed-out visitors to the home URL get the public landing page in place
    // of the decks list; every other signed-in page still asks them to sign in.
    if (!context.isAuthenticated && location.pathname === "/") {
      return { landing: true, sidebarOpen: true, sidebarWidth: clampSidebarWidth(Number.NaN) };
    }
    if (!context.isAuthenticated) {
      // Keep the page the user asked for, minus the origin, so sign-in can
      // return to it. The sign-in route validates it again before using it.
      const redirectTo = `${location.pathname}${location.searchStr}${location.hash}`;
      throw redirect({
        to: "/sign-in",
        search: redirectTo === "/" ? {} : { redirect: redirectTo },
      });
    }
    return { landing: false, sidebarOpen: readSidebarOpen(), sidebarWidth: readSidebarWidth() };
  },
  head: ({ match }) => (match.context.landing ? { meta: LANDING_META } : {}),
  component: AppRoute,
});

const LANDING_META = [
  { title: "Armin · Flashcards that respect what comes first" },
  {
    name: "description",
    content:
      "Armin is a spaced-repetition flashcard app where cards declare their prerequisites. A card stays locked until its foundations are learned, and FSRS schedules every review.",
  },
];

function AppRoute() {
  const { landing } = Route.useRouteContext();
  return landing ? <LandingPage /> : <AppLayout />;
}

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
  const signingOut = useSigningOut();
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

  // Signing out ends the session before the sign-in page loads, so show a
  // steady "Signing out" page instead of the signed-out message.
  if (signingOut) return <FullPageMessage title="Signing out" />;
  if (viewer.isLoading) return <Shell loading="Loading your library" />;
  if (viewer.isError || data === null) {
    return (
      <FullPageMessage
        title="You're signed out"
        body="Your session ended. Sign in again to continue."
        action={<Button onClick={() => window.location.assign("/sign-in")}>Sign in</Button>}
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
  if (data.library?.status === "resetting") {
    return (
      <FullPageMessage
        title="Restoring sample data"
        body="This shared test library resets periodically. It will reopen automatically when the reset finishes."
      />
    );
  }
  if (!data.library) {
    return provisionError ? (
      <FullPageMessage
        title="Couldn't set up your library"
        body={provisionError}
        action={<SignOutButton />}
      />
    ) : (
      <Shell loading="Setting up your library" />
    );
  }
  return <Shell reviewerResetHours={data.reviewer?.resetHours} />;
}

function SignOutButton() {
  return (
    <Button variant="outline" onClick={signOutToSignIn}>
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
        <h1 className="text-lg font-semibold" aria-live="polite">
          {title}
        </h1>
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
 * sidebar renders without live counts and the page area shows the skeleton of
 * the page being opened; the real page then fills the same layout.
 */
function Shell({ loading, reviewerResetHours }: { loading?: string; reviewerResetHours?: number }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [optimisticPathname, setOptimisticPathname] = useState<string | null>(null);
  const activePathname = optimisticPathname ?? pathname;

  // Drop the optimistic highlight once the router catches up.
  if (optimisticPathname !== null && optimisticPathname === pathname) {
    setOptimisticPathname(null);
  }

  const activateNav = (path: string) => flushSync(() => setOptimisticPathname(path));
  const isActive = (path: string, exact = false) =>
    exact
      ? activePathname === path
      : activePathname === path || activePathname.startsWith(`${path}/`);

  const { sidebarOpen, sidebarWidth } = Route.useRouteContext();
  // A full-bleed route (the prerequisite graph) fills the frame instead of the
  // centered page box. Read from the matched routes, which <Outlet/> renders,
  // rather than `:has()` on these wrappers: Chrome re-checks `:has()` on every
  // DOM change below them, which made panning the graph drop frames.
  const fullbleed =
    useMatches({
      select: (matches) => matches.some((match) => match.staticData.fullbleed),
    }) || undefined;

  return (
    <SidebarProvider
      defaultOpen={sidebarOpen}
      defaultWidth={sidebarWidth}
      className="h-dvh min-h-0 overflow-hidden"
    >
      <ShellKeybindings activateNav={activateNav} />
      {!loading && <IdlePreload />}
      {!loading && <StudyClockSync />}
      <AppSidebar ready={!loading} isActive={isActive} onNavigate={activateNav} />
      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-bg px-2 md:hidden">
          <SidebarTrigger className="text-muted hover:text-ink" />
          <Link
            to="/"
            className="flex h-9 items-center gap-2 px-1 text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArminMark className="size-5" />
            <ArminWordmark />
          </Link>
        </header>
        <ConnectionBanner />
        {reviewerResetHours && (
          <div
            role="note"
            className="border-b border-border bg-bg-2 px-4 py-2 text-center text-sm text-ink"
          >
            Shared test account · Everyone can see and change this library. Data resets every{" "}
            {reviewerResetHours} hours. Do not add private material.
          </div>
        )}
        <div className="route-view flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <div
            data-fullbleed={fullbleed}
            className="route-scroll notebook-bg min-h-0 flex-1 overflow-y-auto"
          >
            <div
              data-fullbleed={fullbleed}
              className="route-pad mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
            >
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
        </div>
      </SidebarInset>
      <KeyboardOverlays />
    </SidebarProvider>
  );
}

/** Pages the sidebar always links to; their code and data load while idle. */
const IDLE_PRELOAD_PATHS = ["/", "/review", "/browse", "/stats"] as const;

/**
 * Hovering a link preloads its page, but a quick click or a keyboard shortcut
 * can beat it. Once the signed-in app is idle, load the main pages' code and
 * first data in the background, so their first visit doesn't wait.
 */
function IdlePreload() {
  const router = useRouter();
  useEffect(() => {
    const preload = () => {
      for (const to of IDLE_PRELOAD_PATHS) {
        void router.preloadRoute({ to }).catch(() => undefined);
      }
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 1500);
    return () => clearTimeout(id);
  }, [router]);
  return null;
}

const NAV_COMMANDS = {
  "nav.decks": "/",
  "nav.browse": "/browse",
  "nav.review": "/review",
  "nav.settings": "/settings",
} as const;

type NavTarget = (typeof NAV_COMMANDS)[keyof typeof NAV_COMMANDS];

/** Global navigation and sidebar shortcuts; lives inside the SidebarProvider. */
function ShellKeybindings({ activateNav }: { activateNav: (path: string) => void }) {
  const navigate = useNavigate();
  const router = useRouter();
  const { keymap, pendingChord } = useKeybindings();
  const { toggleSidebarInstantly } = useSidebar();
  const go = (to: NavTarget) => {
    activateNav(to);
    void navigate({ to });
  };

  // Keyboard counterpart of preloading on hover: once a chord's first key
  // (`g`) is down, start loading every page it can still lead to, so the page
  // is usually ready by the time the second key lands.
  useEffect(() => {
    if (pendingChord.length === 0) return;
    for (const [command, to] of Object.entries(NAV_COMMANDS)) {
      const binding = keymap[command as keyof typeof NAV_COMMANDS];
      if (binding && isStepsPrefix(pendingChord, parseBinding(binding))) {
        void router.preloadRoute({ to }).catch(() => undefined);
      }
    }
  }, [keymap, pendingChord, router]);

  useScope("global", {
    "nav.decks": () => go(NAV_COMMANDS["nav.decks"]),
    "nav.browse": () => go(NAV_COMMANDS["nav.browse"]),
    "nav.review": () => go(NAV_COMMANDS["nav.review"]),
    "nav.settings": () => go(NAV_COMMANDS["nav.settings"]),
    "sidebar.toggle": toggleSidebarInstantly,
  });

  return null;
}
