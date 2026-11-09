import { mount } from "@cloudflare/nimbus-docs/client";
import type { SearchProvider } from "@cloudflare/nimbus-docs/types";
import { provider, type SectionedSearchResult } from "./providers/pagefind";

interface RecentPage {
  title: string;
  url: string;
  section?: string;
}

const RECENT_KEY = "armin-docs-recent-searches";
const RECENT_LIMIT = 5;

function readRecent(): RecentPage[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (item): item is RecentPage =>
            typeof item?.title === "string" && typeof item?.url === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeRecent(pages: RecentPage[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(pages.slice(0, RECENT_LIMIT)));
  } catch {}
}

function rememberPage(page: RecentPage): void {
  writeRecent([page, ...readRecent().filter((item) => item.url !== page.url)]);
}

export interface SearchElements {
  dialog: HTMLDialogElement;
  input: HTMLInputElement;
  clearButton: HTMLButtonElement | null;
  body: HTMLElement;
  status: HTMLElement;
  listbox: HTMLElement;
  suggestions: HTMLElement | null;
}

export interface SearchInstance {
  open(): void;
  destroy(): void;
}

export function initSearch(
  elements: SearchElements,
  searchProvider: SearchProvider,
): SearchInstance {
  const { dialog, input, clearButton, body, status, listbox, suggestions } = elements;

  let activeIndex = -1;
  let optionCounter = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let activeController: AbortController | undefined;
  let lastQuery = "";

  const icon = (name: string): Node | null =>
    dialog
      .querySelector<HTMLTemplateElement>(`template[data-search-icon="${name}"]`)
      ?.content.cloneNode(true) ?? null;

  function setStatus(message: string, quiet = false): void {
    status.textContent = message;
    status.toggleAttribute("data-quiet", quiet || message === "");
  }

  const options = (): HTMLElement[] =>
    Array.from(listbox.querySelectorAll<HTMLElement>("[role='option']"));

  function highlight(index: number, { scroll = true } = {}): void {
    const all = options();
    activeIndex = all.length === 0 ? -1 : Math.max(0, Math.min(index, all.length - 1));
    all.forEach((option, i) => {
      const on = i === activeIndex;
      option.toggleAttribute("data-highlighted", on);
      option.setAttribute("aria-selected", String(on));
    });
    const active = all[activeIndex];
    if (active) {
      input.setAttribute("aria-activedescendant", active.id);
      if (scroll) active.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function clearOptions(): void {
    listbox.replaceChildren();
    listbox.hidden = true;
    activeIndex = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function showOptions(): void {
    listbox.hidden = false;
    input.setAttribute("aria-expanded", "true");
    body.scrollTop = 0;
    highlight(0, { scroll: false });
  }

  function option(page: RecentPage, kind: "page" | "heading" | "recent"): HTMLAnchorElement {
    const link = document.createElement("a");
    link.id = `search-option-${optionCounter++}`;
    link.href = page.url;
    link.tabIndex = -1;
    link.setAttribute("role", "option");
    link.setAttribute("aria-selected", "false");
    link.className =
      kind === "heading"
        ? "group flex items-center gap-2.5 py-1.5 ps-9 pe-3 text-[0.8125rem] text-muted-foreground no-underline data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
        : "group flex items-start gap-3 px-3 py-2.5 no-underline data-[highlighted]:bg-muted";

    const lead = document.createElement("span");
    lead.setAttribute("aria-hidden", "true");
    lead.className =
      kind === "heading"
        ? "flex shrink-0 text-muted-foreground/70"
        : "mt-0.5 flex shrink-0 text-muted-foreground group-data-[highlighted]:text-brand";
    const leadIcon = icon(kind === "recent" ? "recent" : kind);
    if (leadIcon) lead.append(leadIcon);
    link.append(lead);

    const text = document.createElement("span");
    text.className = "min-w-0 flex-1";
    if (kind !== "heading" && page.section) {
      const section = document.createElement("span");
      section.className =
        "block text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground";
      section.textContent = page.section;
      text.append(section);
    }
    const title = document.createElement("span");
    title.className =
      kind === "heading" ? "block truncate" : "block truncate text-sm font-medium text-foreground";
    title.textContent = page.title;
    text.append(title);
    link.append(text);

    const enter = document.createElement("span");
    enter.setAttribute("aria-hidden", "true");
    enter.className =
      "invisible flex shrink-0 self-center text-muted-foreground group-data-[highlighted]:visible";
    const enterIcon = icon("enter");
    if (enterIcon) enter.append(enterIcon);
    link.append(enter);

    link.addEventListener("click", () => {
      if (kind !== "recent") rememberPage(page);
      dialog.close();
    });
    return link;
  }

  function groupLabel(text: string, action?: HTMLElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between px-3 pt-2 pb-1";
    const label = document.createElement("span");
    label.className = "text-xs font-medium text-muted-foreground";
    label.textContent = text;
    row.append(label);
    if (action) row.append(action);
    return row;
  }

  function showIdle(): void {
    clearOptions();
    const recent = readRecent();
    if (suggestions) suggestions.hidden = false;
    if (recent.length === 0) {
      setStatus("Search every page of the Armin docs.");
      return;
    }
    setStatus("", true);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className =
      "text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => {
      writeRecent([]);
      showIdle();
      input.focus();
    });

    const group = document.createElement("div");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Recently opened");
    group.append(groupLabel("Recently opened", clear));
    for (const page of recent) group.append(option(page, "recent"));
    listbox.append(group);
    showOptions();
  }

  function showResults(query: string, results: SectionedSearchResult[]): void {
    clearOptions();
    if (results.length === 0) {
      setStatus(
        `No results for “${query}”. Check the spelling, or try a shorter or different word.`,
      );
      if (suggestions) suggestions.hidden = false;
      return;
    }
    if (suggestions) suggestions.hidden = true;
    setStatus(`${results.length} ${results.length === 1 ? "page" : "pages"} found`, true);

    for (const result of results) {
      const group = document.createElement("div");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", result.title);
      group.className = "border-b border-border py-1 last:border-b-0";

      const page = option(
        { title: result.title, url: result.url, section: result.section },
        "page",
      );
      if (result.snippet) {
        const snippet = document.createElement("span");
        snippet.className =
          "mt-0.5 line-clamp-2 block text-[0.8125rem] leading-snug text-muted-foreground";
        snippet.innerHTML = result.snippet;
        page.querySelector(".min-w-0")?.append(snippet);
      }
      group.append(page);

      for (const heading of result.subResults?.slice(0, 4) ?? []) {
        group.append(
          option({ title: heading.title, url: heading.url, section: result.title }, "heading"),
        );
      }
      listbox.append(group);
    }
    showOptions();
  }

  let ready: Promise<boolean> | undefined;

  function ensureReady(): Promise<boolean> {
    ready ??= Promise.resolve(searchProvider.init?.())
      .then(() => true)
      .catch(() => {
        ready = undefined;
        return false;
      });
    return ready;
  }

  async function runSearch(query: string): Promise<void> {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;

    if (!(await ensureReady())) {
      if (controller.signal.aborted) return;
      clearOptions();
      if (suggestions) suggestions.hidden = true;
      setStatus(
        import.meta.env.DEV
          ? "Search works on a production build: run the docs build, then preview."
          : "Search couldn't load. Check your connection and try again.",
      );
      return;
    }
    if (controller.signal.aborted) return;

    try {
      const results = await searchProvider.search(query, { signal: controller.signal });
      if (controller.signal.aborted) return;
      lastQuery = query;
      showResults(query, results);
    } catch {
      if (controller.signal.aborted) return;
      clearOptions();
      setStatus("Search is unavailable right now. Try again in a moment.");
    }
  }

  function syncClearButton(): void {
    if (clearButton) clearButton.hidden = input.value === "";
  }

  function handleInput(): void {
    syncClearButton();
    activeController?.abort();
    if (debounceTimer) clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (!query) {
      lastQuery = "";
      showIdle();
      return;
    }
    debounceTimer = setTimeout(() => void runSearch(query), 120);
  }

  function handleKeydown(event: KeyboardEvent): void {
    const count = options().length;
    if (event.key === "ArrowDown" && count) {
      event.preventDefault();
      highlight(activeIndex + 1 >= count ? 0 : activeIndex + 1);
    } else if (event.key === "ArrowUp" && count) {
      event.preventDefault();
      highlight(activeIndex <= 0 ? count - 1 : activeIndex - 1);
    } else if (event.key === "PageDown" && count) {
      event.preventDefault();
      highlight(activeIndex + 5);
    } else if (event.key === "PageUp" && count) {
      event.preventDefault();
      highlight(activeIndex - 5);
    } else if (event.key === "Enter") {
      const query = input.value.trim();
      if (debounceTimer && query && query !== lastQuery) {
        event.preventDefault();
        clearTimeout(debounceTimer);
        void runSearch(query);
        return;
      }
      const active = options()[activeIndex];
      if (!active) return;
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        window.open((active as HTMLAnchorElement).href, "_blank", "noopener");
        return;
      }
      active.click();
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    const target = (event.target as Element | null)?.closest<HTMLElement>("[role='option']");
    if (!target) return;
    const index = options().indexOf(target);
    if (index !== -1 && index !== activeIndex) highlight(index, { scroll: false });
  }

  function handleSuggestion(event: Event): void {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "[data-search-suggestion]",
    );
    if (!button) return;
    input.value = button.textContent?.trim() ?? "";
    syncClearButton();
    input.focus();
    void runSearch(input.value);
  }

  function handleClear(): void {
    input.value = "";
    input.focus();
    handleInput();
  }

  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", handleKeydown);
  listbox.addEventListener("pointermove", handlePointerMove);
  suggestions?.addEventListener("click", handleSuggestion);
  clearButton?.addEventListener("click", handleClear);

  return {
    open() {
      if (!dialog.open) dialog.showModal();
      const query = input.value.trim();
      syncClearButton();
      if (query) {
        input.select();
        void runSearch(query);
      } else {
        showIdle();
        void ensureReady();
      }
      input.focus();
    },
    destroy() {
      activeController?.abort();
      if (debounceTimer) clearTimeout(debounceTimer);
      input.removeEventListener("input", handleInput);
      input.removeEventListener("keydown", handleKeydown);
      listbox.removeEventListener("pointermove", handlePointerMove);
      suggestions?.removeEventListener("click", handleSuggestion);
      clearButton?.removeEventListener("click", handleClear);
    },
  };
}

type SearchDialogElement = HTMLDialogElement & {
  __openSearchDialog?: () => void;
};

function primaryDialog(): SearchDialogElement | null {
  return document.querySelector<SearchDialogElement>("[data-search-dialog][data-search-ready]");
}

const isTyping = (element: Element | null): boolean =>
  element instanceof HTMLElement &&
  (element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.isContentEditable);

let globalsBound = false;

function bindGlobals() {
  if (globalsBound) return;
  globalsBound = true;

  document.addEventListener("click", (event) => {
    const trigger = (event.target as Element | null)?.closest("[data-search-trigger]");
    if (!trigger) return;
    primaryDialog()?.__openSearchDialog?.();
  });

  const preload = (event: Event) => {
    if ((event.target as Element | null)?.closest?.("[data-search-trigger]"))
      void provider.init?.();
  };
  document.addEventListener("pointerover", preload);
  document.addEventListener("focusin", preload);

  document.addEventListener("keydown", (event) => {
    const dialog = primaryDialog();
    if (!dialog) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (dialog.open) dialog.close();
      else dialog.__openSearchDialog?.();
      return;
    }
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (dialog.open || isTyping(document.activeElement)) return;
      event.preventDefault();
      dialog.__openSearchDialog?.();
    }
  });
}

mount("[data-search-dialog]", (root) => {
  const dialog = root as SearchDialogElement;
  const input = dialog.querySelector<HTMLInputElement>("[data-search-input]");
  const body = dialog.querySelector<HTMLElement>("[data-search-body]");
  const status = dialog.querySelector<HTMLElement>("[data-search-status]");
  const listbox = dialog.querySelector<HTMLElement>("[data-search-results]");
  if (!input || !body || !status || !listbox) return () => {};
  dialog.setAttribute("data-search-ready", "true");

  const search = initSearch(
    {
      dialog,
      input,
      clearButton: dialog.querySelector<HTMLButtonElement>("[data-search-clear]"),
      body,
      status,
      listbox,
      suggestions: dialog.querySelector<HTMLElement>("[data-search-suggestions]"),
    },
    provider,
  );

  dialog.__openSearchDialog = () => search.open();
  return () => search.destroy();
});

bindGlobals();
