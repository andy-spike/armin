/** Sidebar runtime: persistence.
 *
 * Groups are native `<details>`: open state is the element's own `open`
 * property, and changes arrive as `toggle` events (captured on the root —
 * `toggle` doesn't bubble). No click simulation. Rows carry no class or data
 * attribute, so a link row is any `li > a` and a group any `details`.
 */

import { mount } from "@cloudflare/nimbus-docs/client";

const STORAGE_KEY = "sidebar-state";

interface SidebarState {
  hash: string;
  open: boolean[];
  scroll: number;
}

function groupsOf(root: HTMLElement): HTMLDetailsElement[] {
  return Array.from(root.querySelectorAll<HTMLDetailsElement>("details"));
}

function initSidebar(root: HTMLElement): () => void {
  const teardowns: Array<() => void> = [];
  const persist = root.hasAttribute("data-nb-sidebar-persist");

  if (persist) {
    const persistTeardown = initPersistence(root);
    if (persistTeardown) teardowns.push(persistTeardown);
  }

  return () => teardowns.forEach((t) => t());
}

// ---------------------------------------------------------------------------
// Persistence (open state + scroll)
// ---------------------------------------------------------------------------

function initPersistence(root: HTMLElement): (() => void) | null {
  // The scrollable container: the movable tree wrapper (shared between the
  // desktop rail and the drawer), the enclosing <aside>, or the root itself.
  const scrollHost: HTMLElement =
    root.closest<HTMLElement>("[data-nb-sidebar-tree]") ?? root.closest("aside") ?? root;
  const hash = root.dataset.nbSidebarHash ?? "";

  function savedScroll(): number | null {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
      return saved?.hash === hash && typeof saved.scroll === "number" ? saved.scroll : null;
    } catch {
      return null;
    }
  }

  // A hidden tree (the rail on a phone) reads scrollTop 0: keep the last
  // scroll it had while visible.
  function readState(): SidebarState {
    return {
      hash,
      open: groupsOf(root).map((group) => group.open),
      scroll: scrollHost.clientHeight > 0 ? scrollHost.scrollTop : (savedScroll() ?? 0),
    };
  }

  // Shown after being hidden (the mobile drawer opening): apply the saved
  // scroll, then bring the current page into view if it is outside it.
  function restoreScroll() {
    const scroll = savedScroll();
    if (scroll !== null) scrollHost.scrollTop = scroll;
    const active = root.querySelector("[aria-current='page']");
    if (!active) return;
    const box = scrollHost.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.top < box.top || item.bottom > box.bottom) {
      scrollHost.scrollTop += item.top - box.top - box.height / 2 + item.height / 2;
    }
  }

  let visible = scrollHost.clientHeight > 0;
  const resize =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => {
          const nowVisible = scrollHost.clientHeight > 0;
          if (nowVisible && !visible) restoreScroll();
          visible = nowVisible;
        });
  resize?.observe(scrollHost);

  function save() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(readState()));
    } catch {}
  }

  // `toggle` doesn't bubble; capture on the root observes every group. A
  // group the filter opened is transient state and not saved.
  const handleToggle = (event: Event) => {
    const group = event.target as HTMLElement | null;
    if (!(group instanceof HTMLDetailsElement)) return;
    if (group.hasAttribute("data-nb-opened-by-filter")) return;
    save();
  };
  root.addEventListener("toggle", handleToggle, true);

  function handleVisibility() {
    if (document.visibilityState === "hidden") save();
  }
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("pagehide", save);

  let raf = 0;
  function handleScroll() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(save);
  }
  scrollHost.addEventListener("scroll", handleScroll);

  return () => {
    resize?.disconnect();
    root.removeEventListener("toggle", handleToggle, true);
    document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("pagehide", save);
    scrollHost.removeEventListener("scroll", handleScroll);
    cancelAnimationFrame(raf);
  };
}

mount("[data-nb-sidebar]", initSidebar);
