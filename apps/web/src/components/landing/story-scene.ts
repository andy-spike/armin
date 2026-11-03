import {
  CARD_BACK,
  CARD_FRONT,
  DECK,
  DECK_EDGES,
  DECK_NAME,
  FIELD,
  FIELD_EDGES,
  FIELD_WAVE_END,
  FIELD_WAVE_START,
  REVIEWS,
  fieldStates,
  type NodeId,
  type NodeState,
} from "./story-data";

/**
 * The scroll story's timeline. `t` runs from 0 to 6: one unit per beat.
 *
 *   0  hero: the deck with an empty slot at the top, foundations due
 *   1  write a card: the camera moves in and the editor opens in the empty slot
 *   2  link it: the editor folds into a new, unlinked card; a cursor drags a
 *      link up to it from Recursion, then from Lookup tables, and it locks
 *   3  review: the three due cards are answered and graded, one by one
 *   4  unlock: days pass, edges ink upwards, each layer opens in turn
 *   5  pull back: the deck becomes one branch of a whole subject
 *
 * Every value is written straight to the element that moves (no inherited
 * custom properties, no React state per frame), and only when it changes.
 * Reduced motion shows one settled frame per beat (SETTLED in scroll-story).
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const within = (t: number, a: number, b: number) => t >= a && t < b;

/** Evaluates a CSS cubic-bezier, so scroll-linked values share the app's curves. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let s = p;
    for (let i = 0; i < 8; i++) {
      const error = x(s) - p;
      if (Math.abs(error) < 1e-5) return y(s);
      const slope = dx(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    // Newton's method stalls on flat ends; bisection always converges.
    let lo = 0;
    let hi = 1;
    s = p;
    for (let i = 0; i < 24; i++) {
      if (x(s) < p) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return y(s);
  };
}

// The motion tokens in app.css (--ease-out, --ease-in-out).
const easeOut = cubicBezier(0.23, 1, 0.32, 1);
const easeInOut = cubicBezier(0.77, 0, 0.175, 1);

/*
 * Beat 3 is a stepper, not a scrub. The first card teaches the loop with four
 * resting stations, each named by the coach bar on the review card:
 *
 *   recall   the question is up: read it and recall the answer
 *   ask      the coach asks for Space and rings Show answer
 *   prompt   Space was pressed and the answer is shown; the coach asks for a grade
 *   graded   the grade key was pressed and the grade landed on the graph
 *
 * The next two cards repeat the loop with two stations each (prompt, graded),
 * and a final "caught up" station closes the beat. Scroll picks the station (see
 * reviewStation); the page then plays from one station to the next at a
 * steady pace, so each key press and reveal runs in full and the caption's
 * steps change only when a step is complete.
 */
const REVIEW_START = 3.04;
const REVIEW_STEP = 0.3;
const REVIEW_END = [3.935, 3.975] as const;
const CAUGHT_UP = 3.988;
const REVIEW_TIMES = REVIEWS.map((_, i) => {
  const s = REVIEW_START + i * REVIEW_STEP;
  return {
    start: s,
    recall: s + 0.06,
    hint: s + 0.075,
    ask: s + 0.09,
    space: [s + 0.1, s + 0.12] as const,
    answer: [s + 0.11, s + 0.17] as const,
    flipped: s + 0.13,
    prompt: s + 0.19,
    grade: [s + 0.21, s + 0.24] as const,
    learned: s + 0.24,
    graded: s + 0.28,
  };
});
const reviewIndex = (t: number) =>
  REVIEW_TIMES.reduce((active, r, i) => (t >= r.start - 0.015 ? i : active), 0);

/**
 * Every resting point of the review beat, with its share of the beat's scroll.
 * The first card's question gets extra room while the caption scrolls in.
 */
const STATIONS = [
  ...REVIEW_TIMES.flatMap((r, i) =>
    i === 0
      ? [
          { t: r.recall, share: 1.6 },
          { t: r.ask, share: 1 },
          { t: r.prompt, share: 1 },
          { t: r.graded, share: 1 },
        ]
      : [
          { t: r.prompt, share: 1 },
          { t: r.graded, share: 1 },
        ],
  ),
  { t: CAUGHT_UP, share: 1 },
];
const STATION_TOTAL = STATIONS.reduce((sum, station) => sum + station.share, 0);

/** Maps a scroll position inside the review beat to the station it rests on. */
export function reviewStation(t: number) {
  if (t < 3 || t >= 4) return t;
  let edge = 0;
  for (const station of STATIONS) {
    edge += station.share / STATION_TOTAL;
    if (t - 3 < edge) return station.t;
  }
  return CAUGHT_UP;
}

export const inReview = (t: number) => t >= 3 && t < 4;

const RATING_NAMES = ["Again", "Hard", "Good", "Easy"];

/** The line under the caption's steps: each grade's result, then the wrap-up. */
function reviewResultAt(t: number) {
  if (t < 3) return "";
  if (t >= REVIEW_END[0]) return "All caught up. Each card comes back when it's due.";
  const i = reviewIndex(t);
  if (t < REVIEW_TIMES[i]!.learned) return "";
  const days = REVIEWS[i]!.chip.split(" · ")[1]!.replace("d", "");
  return `${RATING_NAMES[REVIEWS[i]!.rating]}: back in ${days} days.`;
}

type StepState = "upcoming" | "current" | "done";

/** Where the card in review is among the three steps the caption lists. */
function reviewSteps(t: number): [StepState, StepState, StepState] {
  if (t < 3) return ["upcoming", "upcoming", "upcoming"];
  if (t >= REVIEW_END[0]) return ["done", "done", "done"];
  const r = REVIEW_TIMES[reviewIndex(t)]!;
  if (t < r.hint) return ["current", "upcoming", "upcoming"];
  if (t < r.flipped) return ["done", "current", "upcoming"];
  if (t < r.learned) return ["done", "done", "current"];
  return ["done", "done", "done"];
}

/**
 * The coach bar on the review card: which step the first card is on and what it
 * expects next, a reminder on the later cards, and each grade's result.
 */
function coachAt(t: number) {
  const i = reviewIndex(t);
  const r = REVIEW_TIMES[i]!;
  if (t >= r.learned) return `result-${i}`;
  if (i > 0) return `repeat-${i}`;
  if (t < r.hint) return "recall";
  if (t < r.flipped) return "space";
  return "grade";
}

function deckState(id: NodeId, t: number): NodeState {
  const reviewed = REVIEWS.findIndex((r) => r.id === id);
  if (reviewed !== -1) return t >= REVIEW_TIMES[reviewed]!.learned ? "learned" : "due";
  switch (id) {
    case "recursion":
    case "tables":
      return t >= 4.35 ? "learned" : t >= 4.14 ? "due" : "locked";
    case "memo":
      if (t >= 4.7) return "learned";
      if (t >= 4.52) return "due";
      return t < LINKS[0].release ? "new" : "locked";
    default:
      return "due";
  }
}

/** How far each lit (accent) edge has drawn: learned cards light their way up. */
function litProgress(key: string, t: number) {
  if (key.endsWith("-memo")) return easeOut(seg(t, 4.38, 4.52));
  return easeOut(seg(t, 4.0, 4.14));
}

/* Beat 2: one drag per prerequisite, from that card up to Memoization. */
const LINKS = [
  { from: "recursion", key: "recursion-memo", press: 2.3, drag: [2.31, 2.45], release: 2.45 },
  { from: "tables", key: "tables-memo", press: 2.54, drag: [2.55, 2.69], release: 2.69 },
] as const;
type Link = (typeof LINKS)[number];
const CURSOR_IN = [2.26, 2.3] as const;
const CURSOR_HOP = [2.47, 2.53] as const;
const CURSOR_OUT = [2.72, 2.76] as const;
// The drag runs between the cards' edges, not their centres, so the cursor
// picks the link up on the source card's top and lets go on Memoization's bottom.
const GRAB = 0.15;
const DROP = 0.85;

const POINTS = new Map(DECK.map((n) => [n.id, n]));

/** A point on the S-curve edge from `from` up to `to` (the same curve as edgePath). */
function curvePoint(from: NodeId, to: NodeId, p: number) {
  const a = POINTS.get(from)!;
  const b = POINTS.get(to)!;
  const mid = (a.y + b.y) / 2;
  const u = 1 - p;
  return {
    x: u * u * u * a.x + 3 * u * u * p * a.x + 3 * u * p * p * b.x + p * p * p * b.x,
    y: u * u * u * a.y + 3 * u * u * p * mid + 3 * u * p * p * mid + p * p * p * b.y,
  };
}

const dragPoint = (link: Link, t: number) =>
  curvePoint(link.from, "memo", lerp(GRAB, DROP, easeInOut(seg(t, link.drag[0], link.drag[1]))));

/** How much of a link's edge shows: its tip follows the cursor, then completes. */
function linkProgress(link: Link, t: number) {
  if (t >= link.release) return 1;
  if (t < link.drag[0]) return 0;
  const a = POINTS.get(link.from)!;
  const b = POINTS.get("memo")!;
  return (a.y - dragPoint(link, t).y) / (a.y - b.y);
}

function cursorAt(t: number) {
  const [first, second] = LINKS;
  let point: { x: number; y: number };
  if (t < CURSOR_HOP[0]) point = dragPoint(first, t);
  else if (t < second.drag[0]) {
    // Between links the cursor travels to the next card without dragging.
    const a = curvePoint(first.from, "memo", DROP);
    const b = curvePoint(second.from, "memo", GRAB);
    const m = easeInOut(seg(t, CURSOR_HOP[0], CURSOR_HOP[1]));
    point = { x: lerp(a.x, b.x, m), y: lerp(a.y, b.y, m) };
  } else point = dragPoint(second, t);
  const opacity = seg(t, CURSOR_IN[0], CURSOR_IN[1]) * (1 - seg(t, CURSOR_OUT[0], CURSOR_OUT[1]));
  const pressed = LINKS.some((link) => within(t, link.press, link.release));
  return { ...point, opacity, pressed };
}

type Camera = { k: number; fx: number; fy: number };
export const HERO_SHOT: Camera = { k: 1.08, fx: 50, fy: 62 };

/** The camera transform for a shot; the hero's is also rendered on the server. */
export const cameraTransform = (cam: Camera) =>
  `translate(${(-(cam.fx - 50) * cam.k).toFixed(3)}%, ${(-(cam.fy - 50) * cam.k).toFixed(3)}%) scale(${cam.k.toFixed(4)})`;
const EDITOR_SHOT: Camera = { k: 1.22, fx: 55, fy: 32 };
const GRAPH_SHOT: Camera = { k: 1, fx: 50, fy: 50 };

const LIBRARY_COUNT = DECK.length + FIELD.length;

/** The stage's header: what is happening on the left, a running count on the right. */
function headerAt(t: number): [string, string] {
  const cards = `${t >= 1.94 ? DECK.length : DECK.length - 1} cards`;
  if (t < 1) return [DECK_NAME, cards];
  if (t < 2.24) return [`${DECK_NAME} › New card`, cards];
  if (t < CURSOR_IN[0]) return ["Memoization added", cards];
  if (t < CURSOR_HOP[0]) return ["Linking Recursion → Memoization", cards];
  if (t < CURSOR_OUT[0]) return ["Linking Lookup tables → Memoization", cards];
  if (t < 3) return ["Memoization locked: needs 2", cards];
  if (t < REVIEW_END[0]) return [`Reviewing ${reviewIndex(t) + 1} of ${REVIEWS.length}`, "Day 1"];
  if (t < 4.14) return ["All caught up", "Day 1"];
  if (t < 4.35) return ["2 cards unlocked", "Day 1"];
  if (t < 4.52) return ["Reviewed as they came due", "Day 4"];
  if (t < 4.7) return ["Memoization unlocked", "Day 4"];
  if (t < 5.1) return [`${DECK_NAME}: every card learned`, "Day 9"];
  return [DECK_NAME, `${LIBRARY_COUNT} cards`];
}

/** Bottom-up reveal for an edge, which always runs from low to high. */
const reveal = (p: number) => `inset(${((1 - p) * 100).toFixed(2)}% -4px -4px -4px)`;

export function createScene(
  stage: HTMLElement,
  stepTrackers: HTMLElement[],
  options: { reducedMotion: () => boolean },
) {
  const one = <T extends Element = HTMLElement>(selector: string) =>
    stage.querySelector<T>(selector)!;

  const camera = one("[data-camera]");
  const nodes = new Map(DECK.map((n) => [n.id, one<HTMLElement>(`[data-node="${n.id}"]`)]));
  const linkEdges = LINKS.map((link) => one<SVGPathElement>(`[data-edge="${link.key}"]`));
  const cursor = one("[data-cursor]");
  const litEdges = new Map(
    DECK_EDGES.map((e) => [e.key, one<SVGPathElement>(`[data-lit-edge="${e.key}"]`)]),
  );
  const chips = REVIEWS.map((r) => one<HTMLElement>(`[data-chip="${r.id}"]`));
  const editor = one("[data-editor]");
  const typed = [
    { el: one("[data-typed=front]"), rest: one("[data-rest=front]"), text: CARD_FRONT },
    { el: one("[data-typed=back]"), rest: one("[data-rest=back]"), text: CARD_BACK },
  ];
  const caretFront = one("[data-caret=front]");
  const caretBack = one("[data-caret=back]");
  const saveKey = one("[data-key=save]");
  const reviewPanel = one("[data-review]");
  const faces = REVIEWS.map((_, i) => one<HTMLElement>(`[data-face="${i}"]`));
  const answers = REVIEWS.map((_, i) => one<HTMLElement>(`[data-answer="${i}"]`));
  const spaceKey = one("[data-key=space]");
  const ratingRow = one("[data-ratings]");
  const coachLines = [...stage.querySelectorAll<HTMLElement>("[data-coach]")];
  const ratingKeys = [0, 1, 2, 3].map((i) => one<HTMLElement>(`[data-key="r${i}"]`));
  const field = one("[data-field]");
  const fieldEdgeGroup = one<SVGGElement>("[data-field-edges]");
  const fieldNodes = new Map(
    FIELD.map((n) => [n.id, one<HTMLElement>(`[data-field-node="${n.id}"]`)]),
  );
  const fieldEdges = FIELD_EDGES.map((e) => ({
    from: e.from,
    el: one<SVGPathElement>(`[data-field-edge="${e.key}"]`),
  }));
  const status = one("[data-status]");
  const meta = one("[data-meta]");
  const trackers = stepTrackers.map((tracker) => {
    const all = (selector: string) => [...tracker.querySelectorAll<HTMLElement>(selector)];
    return {
      result: tracker.querySelector<HTMLElement>("[data-review-result]")!,
      steps: all("[data-review-step]"),
      space: all("[data-key-hint=space]"),
      ratings: [0, 1, 2, 3].map((i) => all(`[data-key-hint="r${i}"]`)),
      cards: REVIEWS.map((_, i) => ({
        item: tracker.querySelector<HTMLElement>(`[data-review-progress="${i}"]`)!,
        fill: tracker.querySelector<HTMLElement>(`[data-review-fill="${i}"]`)!,
      })),
    };
  });

  // Last written value per element and key; a frame only touches what changed.
  const written = new WeakMap<Element, Map<string, string>>();
  const changed = (el: Element, key: string, value: string) => {
    let values = written.get(el);
    if (!values) written.set(el, (values = new Map()));
    if (values.get(key) === value) return false;
    values.set(key, value);
    return true;
  };
  const style = (el: HTMLElement | SVGElement, prop: string, value: string) => {
    if (changed(el, prop, value)) el.style.setProperty(prop, value);
  };
  const attr = (el: Element, name: string, on: boolean | string) => {
    const value = on === false ? null : on === true ? "" : on;
    if (!changed(el, `@${name}`, value ?? "\0")) return;
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  };
  const text = (el: Element, value: string) => {
    if (changed(el, "#text", value)) el.textContent = value;
  };
  /** Text that eases in when it changes, so a new line reads as new. */
  const fadeText = (el: HTMLElement, value: string) => {
    if (!changed(el, "#text", value)) return;
    el.textContent = value;
    if (!value) return;
    el.animate(
      options.reducedMotion()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(4px)" },
            { opacity: 1, transform: "none" },
          ],
      { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  };

  let box = { w: 1, h: 1 };
  let nodeW = 1;
  let editorW = 1;
  let reviewW = 1;
  let reviewH = 1;

  const measure = () => {
    box = { w: camera.offsetWidth || 1, h: camera.offsetHeight || 1 };
    nodeW = nodes.get("memo")!.offsetWidth || 1;
    editorW = editor.offsetWidth || 1;
    reviewW = reviewPanel.offsetWidth || 1;
    reviewH = reviewPanel.offsetHeight || 1;
  };

  /**
   * Places a panel between a card on the graph (m = 0) and its resting place
   * near the stage centre (m = 1), so it reads as that card opening up.
   */
  const morph = (
    panel: HTMLElement,
    panelW: number,
    from: NodeId,
    m: number,
    cam: Camera,
    restY = 0,
  ) => {
    const node = DECK.find((n) => n.id === from)!;
    const ox = ((node.x - cam.fx) / 100) * box.w * cam.k;
    const oy = ((node.y - cam.fy) / 100) * box.h * cam.k;
    const s = lerp((nodeW * cam.k) / panelW, 1, m);
    const x = ox * (1 - m);
    const y = lerp(oy, restY, m);
    style(
      panel,
      "transform",
      `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})`,
    );
    style(panel, "opacity", clamp01(m / 0.3).toFixed(3));
    attr(panel, "data-open", m > 0);
  };

  const apply = (t: number) => {
    // Camera: in towards the new card's slot for the editor, out for the library.
    // Camera: the hero frames the cards that exist; writing moves in on the
    // empty slot above them; linking pulls back so the new card and both of
    // its prerequisites are in view; the library pulls back further.
    const toEditor = easeInOut(seg(t, 1, 1.3));
    const toGraph = easeInOut(seg(t, 2, 2.3));
    const pull = easeInOut(seg(t, 5, 5.55));
    const shot = (key: keyof Camera) =>
      lerp(lerp(HERO_SHOT[key], EDITOR_SHOT[key], toEditor), GRAPH_SHOT[key], toGraph);
    const cam: Camera = { k: shot("k") * lerp(1, 0.36, pull), fx: shot("fx"), fy: shot("fy") };

    const editorM = easeInOut(seg(t, 1.02, 1.28)) * (1 - easeInOut(seg(t, 2.0, 2.24)));
    const reviewM =
      easeInOut(seg(t, 3.0, REVIEW_START)) * (1 - easeInOut(seg(t, REVIEW_END[0], REVIEW_END[1])));
    const active = reviewIndex(t);
    const times = REVIEW_TIMES[active]!;

    style(camera, "transform", cameraTransform(cam));
    // The graph stays readable behind the review card, so grades visibly land on it.
    style(camera, "opacity", (1 - 0.65 * editorM - 0.4 * reviewM).toFixed(3));

    for (const node of DECK) {
      const el = nodes.get(node.id)!;
      attr(el, "data-state", deckState(node.id, t));
      // Memoization doesn't exist until the editor folds into it; Function calls
      // hides while the review card rises out of it.
      let opacity = 1;
      if (node.id === "memo") opacity = t < 2 ? 0 : 1 - clamp01(editorM / 0.3);
      if (node.id === "calls" && t < REVIEW_TIMES[0]!.start) {
        opacity = 1 - clamp01(reviewM / 0.3);
      }
      style(el, "opacity", opacity.toFixed(3));
    }
    // The card a link is dragged from is ringed until the link lands.
    for (const link of LINKS) {
      attr(nodes.get(link.from)!, "data-pulse", within(t, link.press, link.release));
    }
    // The card under review is ringed on the graph behind the review card.
    REVIEWS.forEach((r, i) => {
      const slot = REVIEW_TIMES[i]!;
      const ringed = i === active && reviewM > 0.5 && t >= slot.start && t < slot.learned;
      attr(nodes.get(r.id)!, "data-pulse", ringed);
    });

    LINKS.forEach((link, i) => {
      style(linkEdges[i]!, "clip-path", reveal(linkProgress(link, t)));
      attr(linkEdges[i]!, "data-linking", within(t, link.drag[0], link.release));
    });
    const pointer = cursorAt(t);
    style(cursor, "transform", `translate(${pointer.x.toFixed(2)}%, ${pointer.y.toFixed(2)}%)`);
    style(cursor, "opacity", pointer.opacity.toFixed(3));
    attr(cursor, "data-pressed", pointer.pressed);
    for (const [key, el] of litEdges) style(el, "clip-path", reveal(litProgress(key, t)));

    REVIEW_TIMES.forEach((r, i) => {
      const shown = easeOut(seg(t, r.learned, r.learned + 0.04)) * (1 - seg(t, 4.0, 4.06));
      style(chips[i]!, "opacity", shown.toFixed(3));
      style(chips[i]!, "transform", `translate(-50%, ${((1 - shown) * 6).toFixed(2)}px)`);
    });

    // Editor: the card is typed out, then saved.
    morph(editor, editorW, "memo", editorM, cam);
    const counts = [
      Math.round(seg(t, 1.28, 1.52) * CARD_FRONT.length),
      Math.round(seg(t, 1.54, 1.8) * CARD_BACK.length),
    ];
    typed.forEach((field, i) => {
      text(field.el, field.text.slice(0, counts[i]));
      text(field.rest, field.text.slice(counts[i]));
    });
    attr(caretFront, "data-on", within(t, 1.24, 1.53));
    attr(caretBack, "data-on", within(t, 1.53, 1.9));
    attr(saveKey, "data-pressed", within(t, 1.88, 1.96));

    // Review: it rises out of the first due card and folds into the last one.
    const from = t < 3.5 ? REVIEWS[0]!.id : REVIEWS[REVIEWS.length - 1]!.id;
    // It rests at the top of the graph, leaving the foundations row in view
    // below, where each grade lands.
    const restY = Math.min(0, -box.h / 2 + reviewH / 2 + 0.02 * box.h);
    morph(reviewPanel, reviewW, from, reviewM, cam, restY);
    faces.forEach((face, i) => {
      attr(face, "data-active", i === active);
      attr(face, "data-past", i < active);
      const r = REVIEW_TIMES[i]!;
      const shownAnswer = easeOut(seg(t, r.answer[0], r.answer[1]));
      style(answers[i]!, "clip-path", `inset(0 0 ${((1 - shownAnswer) * 100).toFixed(2)}% 0)`);
    });
    attr(reviewPanel, "data-flipped", t >= times.flipped);
    // The coach names the step; the control it asks for is ringed.
    const coach = coachAt(t);
    for (const line of coachLines) attr(line, "data-active", line.dataset.coach === coach);
    attr(spaceKey, "data-hint", coach === "space");
    attr(ratingRow, "data-hint", t >= times.flipped && t < times.learned);
    attr(spaceKey, "data-pressed", within(t, times.space[0], times.space[1]));
    const rating = REVIEWS[active]!.rating;
    ratingKeys.forEach((key, i) => {
      attr(key, "data-pressed", i === rating && within(t, times.grade[0], times.grade[1]));
      attr(key, "data-chosen", i === rating && t >= times.grade[0]);
    });

    // Library: the rest of the subject fades in and learning climbs through it.
    const fieldOpacity = easeOut(seg(t, 5.05, 5.4)).toFixed(3);
    style(field, "opacity", fieldOpacity);
    style(fieldEdgeGroup, "opacity", fieldOpacity);
    if (t >= 5) {
      const wave = lerp(FIELD_WAVE_START, FIELD_WAVE_END, easeInOut(seg(t, 5.3, 5.85)));
      const states = fieldStates(wave);
      for (const [id, el] of fieldNodes) attr(el, "data-state", states.get(id)!);
      for (const edge of fieldEdges) {
        const lit = DECK.some((n) => n.id === edge.from) || states.get(edge.from) === "learned";
        attr(edge.el, "data-lit", lit);
      }
    }

    const [left, right] = headerAt(t);
    text(status, left);
    text(meta, right);

    // The review caption: a bar per card, the three steps for the card in
    // review, the keys it uses lighting up as the stage presses them, and the
    // result of each grade.
    const steps = reviewSteps(t);
    const result = reviewResultAt(t);
    const pressingSpace = within(t, times.space[0], times.space[1]) && t < REVIEW_END[0];
    for (const tracker of trackers) {
      fadeText(tracker.result, result);
      tracker.steps.forEach((el, i) => attr(el, "data-state", steps[i]!));
      tracker.space.forEach((el) => attr(el, "data-pressed", pressingSpace));
      tracker.ratings.forEach((keys, i) => {
        const mine = i === rating && t >= 3 && t < REVIEW_END[0];
        for (const el of keys) {
          attr(el, "data-pressed", mine && within(t, times.grade[0], times.grade[1]));
          attr(el, "data-chosen", mine && t >= times.grade[0]);
        }
      });
      REVIEW_TIMES.forEach((r, i) => {
        const progress = seg(t, r.start, r.learned);
        style(tracker.cards[i]!.fill, "transform", `scaleX(${progress.toFixed(4)})`);
        const state = t >= r.learned ? "done" : i === active && t >= 3 ? "active" : "upcoming";
        attr(tracker.cards[i]!.item, "data-state", state);
      });
    }
  };

  return { measure, apply };
}
