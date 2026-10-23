import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import {
  Brain,
  Check,
  ChevronsUpDown,
  GraduationCap,
  Layers,
  Library,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
} from "lucide-react";
import { api } from "@armin/backend/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
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
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { armin } from "@/lib/armin-client";
import { deckKeys } from "@/lib/armin-query";
import { authClient } from "@/lib/auth-client";
import { useNow, useViewer } from "@/lib/session";
import { TITLEBAR_THEME_OPTIONS } from "@/lib/theme";
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
      if (event.key === "Enter" || event.key === " ") onNavigate(path);
    },
    onClick: () => {
      if (isMobile) setOpenMobile(false);
    },
  });

  return (
    <Sidebar collapsible="icon">
      <BrandHeader linkProps={linkProps("/")} />

      <SidebarContent className="armin-scrollbar">
        <SidebarGroup className="pt-3">
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

        <SidebarGroup>
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <DeckList ready={ready} isActive={isActive} linkProps={linkProps} />
      </SidebarContent>

      <SidebarFooter className="gap-0.5 border-t border-sidebar-border">
        <SidebarMenu className="gap-0.5">
          <NavItem
            to="/settings"
            label="Settings"
            icon={<Settings strokeWidth={1.5} />}
            active={isActive("/settings")}
            linkProps={linkProps("/settings")}
          />
          <ThemeItem />
          <AccountItem />
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
    <SidebarHeader className="relative h-14 flex-row items-center gap-0 p-2">
      <Link
        to="/"
        tabIndex={collapsed ? -1 : undefined}
        className="flex h-8 min-w-0 items-center gap-2.5 px-2 text-ink outline-hidden ring-sidebar-ring focus-visible:ring-2"
        {...linkProps}
      >
        <Brain className="size-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        <span className={cn(fade, "font-serif text-lg leading-none font-semibold tracking-tight whitespace-nowrap")}>
          Armin
        </span>
      </Link>
      {collapsed ? (
        <button
          type="button"
          aria-label="Expand sidebar"
          onClick={toggleSidebar}
          className="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center bg-sidebar text-muted opacity-0 outline-hidden ring-sidebar-ring transition-opacity duration-150 hover:bg-sidebar-accent hover:text-ink hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
        >
          <PanelLeftOpen className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
      ) : (
        !isMobile && (
          <Tooltip
            side="bottom"
            className="px-2.5 py-1.5"
            content={
              <span className="flex items-center gap-2">
                Collapse sidebar <Kbd>[</Kbd>
              </span>
            }
          >
            <button
              type="button"
              aria-label="Collapse sidebar"
              onClick={toggleSidebar}
              className="ml-auto flex size-8 shrink-0 items-center justify-center text-muted outline-hidden ring-sidebar-ring transition-colors duration-150 hover:bg-sidebar-accent hover:text-ink focus-visible:ring-2"
            >
              <PanelLeftClose className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          </Tooltip>
        )
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
  const now = useNow();
  const queueQuery = useQuery({
    ...convexQuery(api.review.queue, { now }),
    enabled: ready,
  });
  const dueCount = queueQuery.data?.items.length ?? 0;
  const statusLabel = !queueQuery.isSuccess
    ? undefined
    : dueCount === 0
      ? "all caught up"
      : `${plural(dueCount, "review unit")} due`;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={statusLabel ? `Review · ${statusLabel}` : "Review"}
        className={cn(
          // Review is the sidebar's main action, so it's drawn as a button
          // rather than a nav row: taller, centred, raised, with its own fill
          // (reviews due) or outline (caught up). The rail keeps the icon at
          // the left so it lines up with the other icons.
          "relative h-9 justify-center border px-3 font-medium shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-colors group-data-[collapsible=icon]:justify-start group-data-[collapsible=icon]:p-[7px]! group-data-[collapsible=icon]:shadow-none",
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
        {queueQuery.isSuccess && (
          // The count hides with the labels; the rail keeps a due dot instead.
          <span
            aria-hidden
            className={cn(
              fade,
              "flex h-5 min-w-5 items-center justify-center px-1.5 text-xs font-semibold tabular-nums",
              dueCount > 0 ? "bg-on-accent/15" : "text-accent",
            )}
          >
            {dueCount > 0 ? (
              dueCount
            ) : (
              <Check className="size-3.5" strokeWidth={2} />
            )}
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
  const decksQuery = useQuery({
    queryKey: deckKeys.all,
    queryFn: () => armin.decks.list(),
    enabled: ready,
  });
  const decks = [...(decksQuery.data ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  if (decksQuery.isSuccess && decks.length === 0) return null;

  return (
    <SidebarGroup
      // Fades as one block; visibility drops once the fade ends so the hidden
      // rows leave the tab order.
      className="transition-[opacity,visibility] duration-150 ease-(--ease-out-quart) delay-75 group-data-[collapsible=icon]:invisible group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:delay-0"
    >
      <SidebarGroupLabel className="text-muted group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-100">
        Your decks
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {!decksQuery.isSuccess
            ? Array.from({ length: 3 }, (_, i) => <SidebarMenuSkeleton key={i} />)
            : decks.map((deck) => {
                const path = `/deck/${deck.id}`;
                return (
                  <SidebarMenuItem key={deck.id}>
                    <SidebarMenuButton
                      isActive={isActive(path)}
                      // The due badge floats over the row's right edge, so long
                      // names truncate before reaching it.
                      className={cn(navButton, deck.due > 0 && "pr-8")}
                      render={
                        <Link
                          to="/deck/$deckId"
                          params={{ deckId: deck.id }}
                          title={deck.name}
                          {...linkProps(path)}
                        />
                      }
                    >
                      <span>{deck.name}</span>
                    </SidebarMenuButton>
                    {deck.due > 0 && (
                      <SidebarMenuBadge className={countBadge}>
                        {deck.due}
                        <span className="sr-only"> due</span>
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

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

/** The signed-in account, with sign-out. */
function AccountItem() {
  const viewer = useViewer();
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
              className="mt-1 gap-2.5 pl-1 group-data-[collapsible=icon]:h-12! group-data-[collapsible=icon]:w-8! group-data-[collapsible=icon]:p-1! data-popup-open:bg-sidebar-accent"
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
            onClick={() =>
              void authClient.signOut().finally(() => window.location.assign("/sign-in"))
            }
          >
            <LogOut strokeWidth={1.5} />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
