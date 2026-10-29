import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@armin/backend/api";
import {
  ArrowUpDown,
  Check,
  ChevronsUpDown,
  GraduationCap,
  Layers,
  Library,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Settings,
  Sun,
  TrendingUp,
  Upload,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DeckActionItems, useDeckActions } from "@/components/deck-actions";
import { ArminMark, ArminWordmark } from "@/components/brand";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { TruncatedLabel } from "@/components/ui/truncated-label";
import { decksQuery as decksQueryOptions, reviewStatusQuery } from "@/lib/queries";
import { useStudyClock } from "@/lib/study-clock";
import { signOutToSignIn } from "@/lib/auth-client";
import { useViewer } from "@/lib/session";
import { TITLEBAR_THEME_OPTIONS } from "@/lib/theme";
import { DECK_SORT_OPTIONS, sortDecks, type DeckSortKey } from "@/lib/sort-decks";
import { cn, plural } from "@/lib/utils";
import { useTheme } from "@/theme/theme-provider";

/**
 * Rows sit muted on the sunken panel; the current page is a paper slip with an
 * accent icon. While collapsing, labels clip instead of growing ellipses.
 */
const navButton =
  "text-muted hover:text-ink data-active:bg-bg data-active:text-ink data-active:hover:bg-bg data-active:[&>svg]:text-accent group-data-[collapsible=icon]:[&>span:last-child]:text-clip";

/**
 * Labels and counts fade with the panel instead of popping out. Fading in waits
 * a beat so text doesn't appear before the panel has room for it.
 */
const fade =
  "transition-opacity duration-150 ease-(--ease-out-quart) delay-75 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:delay-0";

/** One count style for every row: quiet tabular figures, ink when hovered or current. */
const countBadge = cn(
  fade,
  "min-w-5 px-1 text-xs text-muted group-data-[collapsible=icon]:flex peer-hover/menu-button:text-ink peer-data-active/menu-button:text-ink",
);

/**
 * The signed-in app's navigation. `ready` is false while the library is still
 * loading or being provisioned, so live counts and the deck list wait for it.
 * `isActive` and `onNavigate` come from the Shell, which marks the target row
 * active as soon as the pointer goes down instead of after the route loads.
 */
export function AppSidebar({
  ready,
  isActive,
  onNavigate,
}: {
  ready: boolean;
  isActive: (path: string, exact?: boolean) => boolean;
  onNavigate: (path: string) => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  // Pointer-down marks the row active immediately; the mobile sheet closes on
  // click so it stays open long enough to show the press.
  const linkProps = (path: string): LinkProps => ({
    onPointerDown: (event) => {
      if (event.button === 0) onNavigate(path);
    },
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === "") onNavigate(path);
    },
    onClick: () => {
      if (isMobile) setOpenMobile(false);
    },
  });

  return (
    <Sidebar collapsible="icon">
      <BrandHeader linkProps={linkProps("/")} />

      {/* Review and the main pages stay put; only the deck list scrolls. */}
      <SidebarContent className="overflow-hidden">
        <SidebarGroup className="shrink-0 pt-3">
          <SidebarGroupContent>
            <SidebarMenu>
              <ReviewItem
                ready={ready}
                active={isActive("/review")}
                linkProps={linkProps("/review")}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="shrink-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <NavItem
                to="/"
                label="Decks"
                icon={<Layers strokeWidth={1.5} />}
                active={isActive("/", true)}
                linkProps={linkProps("/")}
              />
              <NavItem
                to="/browse"
                label="Browse"
                icon={<Library strokeWidth={1.5} />}
                active={isActive("/browse")}
                linkProps={linkProps("/browse")}
              />
              <NavItem
                to="/stats"
                label="Stats"
                icon={<TrendingUp strokeWidth={1.5} />}
                active={isActive("/stats")}
                linkProps={linkProps("/stats")}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <DeckList ready={ready} isActive={isActive} linkProps={linkProps} />
      </SidebarContent>

      {/* Tools and the theme switch sit above a ruled-off account row, so the
          footer reads as two clear layers: things to use, then who you are. */}
      <SidebarFooter className="gap-0 border-t border-sidebar-border p-0">
        <SidebarMenu className="gap-0.5 p-2">
          <NavItem
            to="/import"
            label="Import from Anki"
            icon={<Upload strokeWidth={1.5} />}
            active={isActive("/import")}
            linkProps={linkProps("/import")}
          />
          <AiSetupItem
            ready={ready}
            active={isActive("/ai-setup")}
            linkProps={linkProps("/ai-setup")}
          />
          <ThemeItem />
        </SidebarMenu>
        <SidebarMenu className="border-t border-sidebar-border p-2">
          <AccountItem onSettings={() => onNavigate("/settings")} />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/**
 * Wordmark and collapse control. The brain mark stays in the icon column in
 * both states, so collapsing never moves it; on the collapsed rail, hovering it
 * reveals the expand control in the same spot.
 */
function BrandHeader({ linkProps }: { linkProps: LinkProps }) {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  return (
    <SidebarHeader className="relative h-14 flex-row items-center gap-0 overflow-hidden p-2">
      <Link
        to="/"
        tabIndex={collapsed ? -1 : undefined}
        className="flex h-8 min-w-0 items-center gap-2.5 px-1.5 text-ink outline-hidden ring-sidebar-ring focus-visible:ring-2"
        {...linkProps}
      >
        <ArminMark className="size-5" />
        <span className={cn(fade, "flex text-lg leading-none")}>
          <ArminWordmark />
        </span>
      </Link>
      {collapsed && (
        <button
          type="button"
          aria-label="Expand sidebar"
          onClick={toggleSidebar}
          className="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center bg-sidebar text-muted opacity-0 outline-hidden ring-sidebar-ring transition-opacity duration-150 hover:bg-sidebar-accent hover:text-ink hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
        >
          <PanelLeftOpen className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
      )}
      {!isMobile && (
        <Tooltip
          side="bottom"
          className="px-2.5 py-1.5"
          content={
            <span className="flex items-center gap-2">
              Collapse sidebar <Kbd>[</Kbd>
            </span>
          }
        >
          {/* Stays mounted and pinned to the expanded panel's right edge, so it
              fades with the labels instead of popping out or sliding across
              the logo while the panel animates. */}
          <button
            type="button"
            aria-label="Collapse sidebar"
            onClick={toggleSidebar}
            tabIndex={collapsed ? -1 : undefined}
            aria-hidden={collapsed || undefined}
            className="absolute top-1/2 left-[calc(var(--sidebar-width)-2.5rem)] flex size-8 -translate-y-1/2 items-center justify-center text-muted outline-hidden ring-sidebar-ring transition-[opacity,visibility,background-color,color] duration-150 ease-(--ease-out-quart) delay-75 hover:bg-sidebar-accent hover:text-ink focus-visible:ring-2 group-data-[collapsible=icon]:invisible group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:delay-0"
          >
            <PanelLeftClose className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
        </Tooltip>
      )}
    </SidebarHeader>
  );
}

type LinkProps = {
  onPointerDown: (event: PointerEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onClick: () => void;
};

function NavItem({
  to,
  label,
  icon,
  active,
  linkProps,
  badge,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  linkProps: LinkProps;
  badge?: ReactNode;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={label}
        className={navButton}
        render={<Link to={to} {...linkProps} />}
      >
        {icon}
        <span className={fade}>{label}</span>
      </SidebarMenuButton>
      {badge}
    </SidebarMenuItem>
  );
}

/** AI setup, with a green dot and count while any assistant is connected. */
function AiSetupItem({
  ready,
  active,
  linkProps,
}: {
  ready: boolean;
  active: boolean;
  linkProps: LinkProps;
}) {
  const connections = useQuery({ ...convexQuery(api.agents.connections, {}), enabled: ready });
  const connected = (connections.data?.connections ?? []).filter(
    (connection) => connection.revokedAt === undefined,
  ).length;
  const status = connected > 0 ? `${plural(connected, "assistant")} connected` : undefined;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={status ? `AI setup · ${status}` : "AI setup"}
        className={cn(navButton, "relative")}
        render={
          <Link
            to="/ai-setup"
            aria-label={status ? `AI setup, ${status}` : "AI setup"}
            {...linkProps}
          />
        }
      >
        <Plug strokeWidth={1.5} />
        <span className={fade}>AI setup</span>
        {connected > 0 && (
          <>
            {/* The count hides with the labels; the rail keeps the dot. */}
            <span
              aria-hidden
              className={cn(
                fade,
                "ml-auto flex items-center gap-1.5 text-xs font-medium text-muted tabular-nums",
              )}
            >
              <span className="size-1.5 rounded-full bg-good" />
              {connected}
            </span>
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-good opacity-0 transition-opacity duration-150 group-data-[collapsible=icon]:opacity-100 group-data-[collapsible=icon]:delay-100"
            />
          </>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Review, with the live due count that used to sit on the header button. */
function ReviewItem({
  ready,
  active,
  linkProps,
}: {
  ready: boolean;
  active: boolean;
  linkProps: LinkProps;
}) {
  const statusQuery = useQuery({ ...reviewStatusQuery(useStudyClock()), enabled: ready });
  const dueCount = statusQuery.data?.due ?? 0;
  const statusLabel = !statusQuery.isSuccess
    ? undefined
    : dueCount === 0
      ? "all caught up"
      : `${plural(dueCount, "review unit")} due`;

  return (
    // A fixed-height slot: the rail shrinks the button to 32px, and centring
    // it here keeps the rows below from jumping 4px on every toggle.
    <SidebarMenuItem className="flex h-9 items-center">
      <SidebarMenuButton
        isActive={active}
        tooltip={statusLabel ? `Review · ${statusLabel}` : "Review"}
        className={cn(
          // Review is the sidebar's main action, so it's drawn as a button
          // rather than a nav row: taller, raised, with its own fill (reviews
          // due) or outline (caught up). The padding allows for the border so
          // the icon and label line up with the rows below.
          "relative h-9 shrink-0 border px-[7px] font-medium shadow-[0_1px_2px_rgb(0_0_0/0.2)] group-data-[collapsible=icon]:p-[7px]!",
          dueCount > 0
            ? "border-transparent bg-accent text-on-accent hover:bg-accent-deep hover:text-on-accent active:bg-accent-deep active:text-on-accent data-active:bg-accent-deep data-active:text-on-accent data-active:hover:bg-accent-deep"
            : "border-border-strong bg-bg text-ink hover:bg-surface-sunken hover:text-ink active:bg-surface-sunken data-active:bg-surface-sunken data-active:text-ink data-active:hover:bg-surface-sunken [&>svg]:text-accent",
        )}
        render={
          <Link
            to="/review"
            aria-label={statusLabel ? `Review, ${statusLabel}` : "Review"}
            {...linkProps}
          />
        }
      >
        <GraduationCap strokeWidth={1.5} />
        <span className={fade}>Review</span>
        {statusQuery.isSuccess && (
          // The count hides with the labels; the rail keeps a due dot instead.
          <span
            aria-hidden
            className={cn(
              fade,
              "ml-auto flex h-5 min-w-5 items-center justify-center px-1.5 text-xs font-semibold tabular-nums",
              dueCount > 0 ? "bg-on-accent/15" : "text-accent",
            )}
          >
            {dueCount > 0 ? dueCount : <Check className="size-3.5" strokeWidth={2} />}
          </span>
        )}
        {dueCount > 0 && (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 size-1.5 bg-on-accent opacity-0 transition-opacity duration-150 group-data-[collapsible=icon]:opacity-100 group-data-[collapsible=icon]:delay-100"
          />
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Every deck, one click away, with its due count. Hidden when collapsed. */
function DeckList({
  ready,
  isActive,
  linkProps,
}: {
  ready: boolean;
  isActive: (path: string, exact?: boolean) => boolean;
  linkProps: (path: string) => LinkProps;
}) {
  // Same cache entry as the Decks page, so both stay in step.
  const decksQuery = useQuery({ ...decksQueryOptions(useStudyClock()), enabled: ready });
  const [sort, setSort] = useDeckListSort();
  const decks = sortDecks(decksQuery.data ?? [], sort);
  const navigate = useNavigate();
  // Deleting the open deck leaves its page behind, so return to Decks.
  const deckActions = useDeckActions({
    onDeleted: (deck) => {
      if (isActive(`/deck/${deck.id}`)) void navigate({ to: "/" });
    },
  });

  if (decksQuery.isSuccess && decks.length === 0) return null;

  return (
    <SidebarGroup
      // Fades as one block; visibility drops once the fade ends so the hidden
      // rows leave the tab order.
      className="min-h-0 flex-1 transition-[opacity,visibility] duration-150 ease-(--ease-out-quart) delay-75 group-data-[collapsible=icon]:invisible group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:delay-0"
    >
      <SidebarGroupLabel className="text-muted group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-100">
        Your decks
      </SidebarGroupLabel>
      <DropdownMenu>
        <Tooltip content="Sort decks" side="right" className="px-2.5 py-1.5">
          <DropdownMenuTrigger
            render={<SidebarGroupAction aria-label="Sort decks" className="text-muted" />}
          >
            <ArrowUpDown strokeWidth={1.5} />
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent side="right" align="start" className="min-w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Sort decks</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => setSort(value as DeckSortKey)}
            >
              {DECK_SORT_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <SidebarGroupContent className="-mx-1 min-h-0 w-[calc(100%+0.5rem)] flex-1 overflow-y-auto px-1">
        <SidebarMenu className="gap-0.5">
          {!decksQuery.isSuccess
            ? Array.from({ length: 3 }, (_, i) => <SidebarMenuSkeleton key={i} />)
            : decks.map((deck) => {
                const path = `/deck/${deck.id}`;
                return (
                  <ContextMenu key={deck.id}>
                    <ContextMenuTrigger render={<SidebarMenuItem />}>
                      <SidebarMenuButton
                        isActive={isActive(path)}
                        // The due badge floats over the row's right edge, so long
                        // names truncate before reaching it.
                        className={cn(navButton, deck.due > 0 && "pr-8")}
                        render={
                          <Link
                            to="/deck/$deckId"
                            params={{ deckId: deck.id }}
                            {...linkProps(path)}
                          />
                        }
                      >
                        <TruncatedLabel label={deck.name} side="right" />
                      </SidebarMenuButton>
                      {deck.due > 0 && (
                        <SidebarMenuBadge className={countBadge}>
                          {deck.due}
                          <span className="sr-only"> due</span>
                        </SidebarMenuBadge>
                      )}
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-40">
                      <DeckActionItems
                        onRename={() => deckActions.rename(deck)}
                        onDelete={() => deckActions.remove(deck)}
                        Item={ContextMenuItem}
                        Separator={ContextMenuSeparator}
                      />
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
        </SidebarMenu>
      </SidebarGroupContent>
      {deckActions.dialogs}
    </SidebarGroup>
  );
}

const DECK_LIST_SORT_KEY = "armin.sidebar.deckSort";

/** The sidebar's deck order, remembered on this device. */
function useDeckListSort() {
  const [sort, setSort] = useState<DeckSortKey>(() => {
    if (typeof window === "undefined") return "name-asc";
    const saved = localStorage.getItem(DECK_LIST_SORT_KEY);
    return DECK_SORT_OPTIONS.some((option) => option.value === saved)
      ? (saved as DeckSortKey)
      : "name-asc";
  });
  const update = (next: DeckSortKey) => {
    setSort(next);
    localStorage.setItem(DECK_LIST_SORT_KEY, next);
  };
  return [sort, update] as const;
}

/** Click flips light/dark; right-click picks a specific theme or System. */
const showInLight = "[[data-theme=dark]_&]:hidden";
const showInDark = "hidden [[data-theme=dark]_&]:inline";

/** Click flips light/dark; right-click picks a specific theme or System. */
function ThemeItem() {
  const { preference, resolved, setPreference } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const label = resolved === "light" ? "Dark mode" : "Light mode";

  return (
    <SidebarMenuItem>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <SidebarMenuButton
          tooltip={label}
          className={navButton}
          aria-haspopup="menu"
          onClick={() => setPreference(resolved === "light" ? "flexoki-dark" : "flexoki-light")}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuOpen(true);
          }}
          // The label is the children below; the rule only sees this element.
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label
          render={<button ref={buttonRef} type="button" />}
        >
          {/* The row is server-rendered, where the saved theme is unknown, so
              it follows the theme already applied to <html> instead of state. */}
          <Moon strokeWidth={1.5} className={showInLight} />
          <Sun strokeWidth={1.5} className={showInDark} />
          <span className={fade}>
            <span className={showInLight}>Dark mode</span>
            <span className={showInDark}>Light mode</span>
          </span>
        </SidebarMenuButton>
        <DropdownMenuContent anchor={buttonRef} side="right" align="end" className="min-w-36">
          {TITLEBAR_THEME_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              className="justify-between"
              onClick={() => {
                setPreference(option.value);
                setMenuOpen(false);
              }}
            >
              <span>{option.label}</span>
              {preference === option.value && <Check aria-hidden />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

/** The signed-in account: settings and sign-out. */
function AccountItem({ onSettings }: { onSettings: () => void }) {
  const viewer = useViewer();
  const navigate = useNavigate();
  const { isMobile: mobile, setOpenMobile } = useSidebar();
  const { isMobile, state } = useSidebar();
  // Above the row, at its width; the collapsed rail is too narrow for that, so
  // there it opens beside the avatar instead.
  const beside = state === "collapsed" && !isMobile;
  const email = viewer.data?.email ?? "";
  const name = viewer.data?.name || email;
  const initial = (name || "?").charAt(0).toUpperCase();

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              size="lg"
              tooltip={email || "Account"}
              // pl-1 centers the 24px avatar on the icon column in both states,
              // and the row keeps its 48px height when collapsed so the footer
              // above it doesn't shift.
              className="gap-2.5 pl-1 group-data-[collapsible=icon]:h-12! group-data-[collapsible=icon]:w-8! group-data-[collapsible=icon]:p-1! data-popup-open:bg-sidebar-accent"
            />
          }
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center bg-accent-tint font-serif text-xs font-semibold text-accent-deep"
          >
            {initial}
          </span>
          <span className={cn(fade, "grid min-w-0 flex-1 text-left leading-tight")}>
            <span className="truncate text-sm font-medium text-ink">{name}</span>
            {name !== email && <span className="truncate text-xs text-muted">{email}</span>}
          </span>
          <ChevronsUpDown className={cn(fade, "ml-auto text-muted")} strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={beside ? "right" : "top"}
          align={beside ? "end" : "start"}
          sideOffset={beside ? 12 : 6}
          className={beside ? "w-auto min-w-56" : undefined}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              onSettings();
              if (mobile) setOpenMobile(false);
              void navigate({ to: "/settings" });
            }}
          >
            <Settings strokeWidth={1.5} />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOutToSignIn}>
            <LogOut strokeWidth={1.5} />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
