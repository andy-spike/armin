import { mount, initTabs } from "@cloudflare/nimbus-docs/client";

const TRIGGER_CLASS =
  "shrink-0 cursor-pointer px-4 py-2 text-sm font-medium leading-6 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-selected:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]";

let counter = 0;

function initTabContainer(container: HTMLElement): () => void {
  const id = `nb-tabs-${counter++}`;
  const syncKey = container.dataset.nbSyncKey;
  const tablist = container.querySelector<HTMLElement>(":scope > [role=tablist]");
  const indicator = tablist?.querySelector<HTMLElement>("[data-nb-tabs-indicator]") ?? null;

  const existingTriggers = Array.from(container.querySelectorAll("[data-nb-tabs-trigger]")).filter(
    (t) => (t as HTMLElement).closest("[data-nb-tabs]") === container,
  );
  const synthesize = existingTriggers.length === 0;
  const panels = Array.from(
    container.querySelectorAll<HTMLElement>("[data-nb-tabs-content]"),
  ).filter((p) => p.closest("[data-nb-tabs]") === container);

  if (!synthesize) {
    (existingTriggers as HTMLElement[]).forEach((trigger, i) => {
      const panel = panels.find((p) => p.dataset.nbValue === trigger.dataset.nbValue);
      if (!panel) return;
      trigger.id ||= `${id}-tab-${i}`;
      panel.id ||= `${id}-panel-${i}`;
      trigger.setAttribute("aria-controls", panel.id);
      panel.setAttribute("aria-labelledby", trigger.id);
    });
  }

  if (synthesize && tablist) {
    panels.forEach((panel, i) => {
      const label = panel.dataset.nbTabLabel ?? "Tab";
      const btn = document.createElement("button");
      btn.role = "tab";
      btn.type = "button";
      btn.className = TRIGGER_CLASS;
      btn.textContent = label;
      btn.setAttribute("data-nb-tabs-trigger", "");
      btn.dataset.slot = "tabs-trigger";

      const panelId = `${id}-panel-${i}`;
      const tabId = `${id}-tab-${i}`;
      btn.id = tabId;
      btn.setAttribute("aria-controls", panelId);
      panel.id = panelId;
      panel.setAttribute("aria-labelledby", tabId);

      if (indicator) {
        tablist.insertBefore(btn, indicator);
      } else {
        tablist.appendChild(btn);
      }
    });
  }

  const instance = initTabs({
    container,
    tabSelector: "[data-nb-tabs-trigger]",
    panelSelector: "[data-nb-tabs-content]",
    boundarySelector: "[data-nb-tabs]",
    indicator,
    sync: syncKey ? { key: `ui-synced-tabs__${syncKey}` } : undefined,
    onActivate: (index) => {
      if (!tablist) return;
      const trigger = tablist.querySelectorAll<HTMLElement>("[data-nb-tabs-trigger]")[index];
      if (!trigger) return;
      const list = tablist.getBoundingClientRect();
      const tab = trigger.getBoundingClientRect();
      if (tab.left < list.left) {
        tablist.scrollLeft += tab.left - list.left;
      } else if (tab.right > list.right) {
        tablist.scrollLeft += tab.right - list.right;
      }
    },
  });

  const markOverflow = () => {
    if (!tablist) return;
    const max = tablist.scrollWidth - tablist.clientWidth;
    const scrolled = Math.abs(tablist.scrollLeft);
    const start = scrolled > 1;
    const end = scrolled < max - 1;
    const state = start && end ? "both" : start ? "start" : end ? "end" : null;
    if (state) tablist.dataset.overflow = state;
    else delete tablist.dataset.overflow;
  };
  const resize = tablist ? new ResizeObserver(markOverflow) : null;
  if (tablist) {
    resize!.observe(tablist);
    tablist.addEventListener("scroll", markOverflow, { passive: true });
  }

  if (import.meta.env.DEV && syncKey && tablist) {
    const labels = Array.from(tablist.querySelectorAll<HTMLElement>("[data-nb-tabs-trigger]"))
      .filter((t) => t.closest("[data-nb-tabs]") === container)
      .map((t) => (t.textContent ?? "").trim());
    const dupes = [...new Set(labels.filter((l, i) => labels.indexOf(l) !== i))];
    if (dupes.length) {
      console.warn(
        `[nimbus] <Tabs syncKey="${syncKey}"> has duplicate tab labels (${dupes
          .map((d) => `"${d}"`)
          .join(", ")}). Sync is keyed by label, so a duplicate activates the ` +
          `first match. Give each tab a unique label.`,
      );
    }
  }

  return () => {
    resize?.disconnect();
    tablist?.removeEventListener("scroll", markOverflow);
    instance.destroy();
    if (synthesize && tablist) {
      tablist.querySelectorAll("[data-nb-tabs-trigger]").forEach((b) => b.remove());
    }
  };
}

mount("[data-nb-tabs]", initTabContainer);
