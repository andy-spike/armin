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
  HERO_EDGES,
  REVIEWS,
  fieldStates,
  type NodeId,
  type NodeState,
} from "./story-data";

/**
 * The scroll story's timeline. `t` runs from 0 to 6: one unit per beat.
 *
 *   0  hero: the deck before Memoization, foundations due, the rest locked
 *   1  write a card: the camera moves in and the editor opens in the empty slot
 *   2  link it: the editor folds into a new card, its prerequisite edges draw
 *      in, and Dynamic programming moves to rest on it
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

/* Beat 3: each review card gets the same rhythm, one after another. */
const REVIEW_START = 3.08;
const REVIEW_STEP = 0.27;
const REVIEW_TIMES = REVIEWS.map((_, i) => {
  const s = REVIEW_START + i * REVIEW_STEP;
  return {
    start: s,
    space: [s + 0.03, s + 0.06] as const,
    answer: [s + 0.05, s + 0.11] as const,
    flipped: s + 0.09,
    grade: [s + 0.17, s + 0.21] as const,
    learned: s + 0.21,
  };
});
const reviewIndex = (t: number) =>
  REVIEW_TIMES.reduce((active, r, i) => (t >= r.start - 0.02 ? i : active), 0);

function deckState(id: NodeId, t: number): NodeState {
  const reviewed = REVIEWS.findIndex((r) => r.id === id);
  if (reviewed !== -1) return t >= REVIEW_TIMES[reviewed]!.learned ? "learned" : "due";
  switch (id) {
    case "recursion":
    case "tables":
      return t >= 4.3 ? "learned" : t >= 4.14 ? "due" : "locked";
    case "memo":
      if (t >= 4.56) return "learned";
      if (t >= 4.46) return "due";
      return t < 2.44 ? "new" : "locked";
    case "dp":
      return t >= 4.8 ? "learned" : t >= 4.7 ? "due" : "locked";
    default:
      return "due";
  }
}

/** How far each lit (accent) edge has drawn: learned cards light their way up. */
function litProgress(key: string, t: number) {
  if (key === "memo-dp") return easeOut(seg(t, 4.58, 4.7));
  if (key.endsWith("-memo")) return easeOut(seg(t, 4.32, 4.46));
  return easeOut(seg(t, 4.0, 4.14));
}

/** Linking Memoization: its prerequisites first, then what builds on it. */
function linkProgress(key: string, t: number) {
  switch (key) {
    case "recursion-memo":
      return easeOut(seg(t, 2.3, 2.44));
    case "tables-memo":
      return easeOut(seg(t, 2.42, 2.56));
    case "memo-dp":
      return easeOut(seg(t, 2.66, 2.8));
    default:
      // The hero's direct edges into Dynamic programming give way to Memoization.
      return 1 - easeOut(seg(t, 2.6, 2.72));
  }
}

const LIBRARY_COUNT = DECK.length + FIELD.length;

/** The stage's header: what is happening on the left, a running count on the right. */
function headerAt(t: number): [string, string] {
  const cards = `${t >= 1.94 ? DECK.length : DECK.length - 1} cards`;
  if (t < 1) return [DECK_NAME, cards];
  if (t < 2.24) return [`${DECK_NAME} › New card`, cards];
  if (t < 2.6) return ["Memoization: linking prerequisites", cards];
  if (t < 2.82) return ["Dynamic programming now needs it", cards];
  if (t < 3) return ["Memoization: locked, needs 2", cards];
  if (t < 3.86) return [`Reviewing ${reviewIndex(t) + 1} of ${REVIEWS.length}`, "Day 1"];
  if (t < 4.14) return ["All caught up", "Day 1"];
  if (t < 4.3) return ["2 cards unlocked", "Day 1"];
  if (t < 4.46) return ["Reviewed as they came due", "Day 4"];
  if (t < 4.56) return ["Memoization unlocked", "Day 4"];
  if (t < 4.7) return ["Reviewed as it came due", "Day 9"];
  if (t < 4.8) return ["Dynamic programming unlocked", "Day 9"];
  if (t < 5.1) return [`${DECK_NAME}: every card learned`, "Day 16"];
  return [DECK_NAME, `${LIBRARY_COUNT} cards`];
}

/** Bottom-up reveal for an edge, which always runs from low to high. */
const reveal = (p: number) => `inset(${((1 - p) * 100).toFixed(2)}% -4px -4px -4px)`;

export function createScene(stage: HTMLElement) {
  const one = <T extends Element = HTMLElement>(selector: string) =>
    stage.querySelector<T>(selector)!;

  const camera = one("[data-camera]");
  const nodes = new Map(DECK.map((n) => [n.id, one<HTMLElement>(`[data-node="${n.id}"]`)]));
  const linkEdges = new Map(
    [...DECK_EDGES.filter((e) => e.from === "memo" || e.to === "memo"), ...HERO_EDGES].map((e) => [
      e.key,
      one<SVGPathElement>(`[data-edge="${e.key}"]`),
    ]),
  );
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

  type Camera = { k: number; fx: number; fy: number };

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
    const zoom = easeInOut(seg(t, 1, 1.3)) * (1 - easeInOut(seg(t, 2, 2.3)));
    const pull = easeInOut(seg(t, 5, 5.55));
    const cam: Camera = {
      k: lerp(1, 1.22, zoom) * lerp(1, 0.36, pull),
      fx: lerp(50, 55, zoom),
      fy: lerp(50, 40, zoom),
    };

    const editorM = easeInOut(seg(t, 1.02, 1.28)) * (1 - easeInOut(seg(t, 2.0, 2.24)));
    const reviewM = easeInOut(seg(t, 3.0, 3.07)) * (1 - easeInOut(seg(t, 3.86, 3.94)));
    const active = reviewIndex(t);
    const times = REVIEW_TIMES[active]!;

    const tx = (-(cam.fx - 50) * cam.k).toFixed(3);
    const ty = (-(cam.fy - 50) * cam.k).toFixed(3);
    style(camera, "transform", `translate(${tx}%, ${ty}%) scale(${cam.k.toFixed(4)})`);
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
    attr(nodes.get("recursion")!, "data-pulse", within(t, 2.28, 2.46));
    attr(nodes.get("tables")!, "data-pulse", within(t, 2.4, 2.58));
    attr(nodes.get("dp")!, "data-pulse", within(t, 2.62, 2.82));
    // The card under review is ringed on the graph behind the review card.
    REVIEWS.forEach((r, i) => {
      const slot = REVIEW_TIMES[i]!;
      const ringed = i === active && reviewM > 0.5 && t >= slot.start && t < slot.learned;
      attr(nodes.get(r.id)!, "data-pulse", ringed);
    });

    for (const [key, el] of linkEdges) style(el, "clip-path", reveal(linkProgress(key, t)));
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
  };

  return { measure, apply };
}
