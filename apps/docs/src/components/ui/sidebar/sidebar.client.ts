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

function initPersistence(root: HTMLElement): (() => void) | null {
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

  function readState(): SidebarState {
    return {
      hash,
      open: groupsOf(root).map((group) => group.open),
      scroll: scrollHost.clientHeight > 0 ? scrollHost.scrollTop : (savedScroll() ?? 0),
    };
  }

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
