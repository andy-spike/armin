import {
  CARD_BACK,
  CARD_FRONT,
  DECK,
  DECK_EDGES,
  FIELD,
  FIELD_EDGES,
  FIELD_WAVE_END,
  FIELD_WAVE_START,
  GRADED,
  fieldStates,
  type NodeId,
  type NodeState,
} from "./story-data";

/**
 * The scroll story's timeline. `t` runs from 0 to 6: one unit per beat.
 *
 *   0  hero: the example deck, foundations due, the rest locked
 *   1  write a card: the camera moves in and Memoization opens into an editor
 *   2  link it: the editor folds back and its prerequisite edges draw in
 *   3  review: a card lifts out of Function calls, is answered, and graded
 *   4  unlock: edges ink upwards, days pass, each layer opens in turn
 *   5  pull back: the deck becomes one branch of a whole subject
 *
 * Reduced motion shows one settled frame per beat instead (SETTLED in
 * scroll-story.tsx).
 * Every value is written straight to the element that moves (no inherited
 * custom properties, no React state per frame), and only when it changes.
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

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

function deckState(id: NodeId, t: number): NodeState {
  switch (id) {
    case "calls":
      return t >= 3.62 ? "learned" : "due";
    case "stack":
      return t >= 3.74 ? "learned" : "due";
    case "arrays":
      return t >= 3.84 ? "learned" : "due";
    case "recursion":
    case "tables":
      return t >= 4.3 ? "learned" : t >= 4.14 ? "due" : "locked";
    case "memo":
      if (t >= 4.56) return "learned";
      if (t >= 4.46) return "due";
      return t >= 1.1 && t < 2.46 ? "new" : "locked";
    case "dp":
      return t >= 4.8 ? "learned" : t >= 4.7 ? "due" : "locked";
  }
}

/** How far each lit (accent) edge has drawn: learned cards light their way up. */
function litProgress(key: string, t: number) {
  if (key === "memo-dp") return easeOut(seg(t, 4.58, 4.7));
  if (key.endsWith("-memo")) return easeOut(seg(t, 4.32, 4.46));
  return easeOut(seg(t, 4.0, 4.14));
}

/** Memoization's own prerequisite edges retract under the editor, then draw in. */
function linkProgress(key: string, t: number) {
  if (t < 1.65) return 1 - easeOut(seg(t, 1.04, 1.22));
  return key === "recursion-memo" ? easeOut(seg(t, 2.28, 2.46)) : easeOut(seg(t, 2.46, 2.64));
}

function statusAt(t: number) {
  if (t < 1) return "Example deck";
  if (t < 2) return "New card";
  if (t < 2.46) return "Linking prerequisites";
  if (t < 3) return "Memoization: locked, needs 2";
  if (t < 3.62) return "Reviewing 1 of 3";
  if (t < 3.74) return "Reviewing 2 of 3";
  if (t < 3.84) return "Reviewing 3 of 3";
  if (t < 4) return "All caught up";
  if (t < 5.1) return "Example deck";
  return "Your library";
}

function dayAt(t: number) {
  if (t < 4.28) return "Day 1";
  if (t < 4.54) return "Day 4";
  if (t < 4.78) return "Day 9";
  return "Day 16";
}

/** Bottom-up reveal for an edge, which always runs from low to high. */
const reveal = (p: number) => `inset(${((1 - p) * 100).toFixed(2)}% -4px -4px -4px)`;

export function createScene(stage: HTMLElement) {
  const one = <T extends Element = HTMLElement>(selector: string) =>
    stage.querySelector<T>(selector)!;

  const camera = one("[data-camera]");
  const nodes = new Map(DECK.map((n) => [n.id, one<HTMLElement>(`[data-node="${n.id}"]`)]));
  const baseEdges = new Map(
    DECK_EDGES.filter((e) => e.to === "memo").map((e) => [
      e.key,
      one<SVGPathElement>(`[data-edge="${e.key}"]`),
    ]),
  );
  const litEdges = new Map(
    DECK_EDGES.map((e) => [e.key, one<SVGPathElement>(`[data-lit-edge="${e.key}"]`)]),
  );
  const chips = GRADED.map((g) => one<HTMLElement>(`[data-chip="${g.id}"]`));
  const editor = one("[data-editor]");
  const typed = {
    front: { el: one("[data-typed=front]"), rest: one("[data-rest=front]"), text: CARD_FRONT },
    back: { el: one("[data-typed=back]"), rest: one("[data-rest=back]"), text: CARD_BACK },
  };
  const caretFront = one("[data-caret=front]");
  const caretBack = one("[data-caret=back]");
  const saveKey = one("[data-key=save]");
  const review = one("[data-review]");
  const answer = one("[data-answer]");
  const spaceKey = one("[data-key=space]");
  const goodKey = one("[data-key=good]");
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
  const day = one("[data-day]");

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
  const attr = (el: Element, name: string, value: string | null) => {
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

  const measure = () => {
    box = { w: camera.offsetWidth || 1, h: camera.offsetHeight || 1 };
    nodeW = nodes.get("memo")!.offsetWidth || 1;
    editorW = editor.offsetWidth || 1;
    reviewW = review.offsetWidth || 1;
  };

  /**
   * Places a panel between a card on the graph (m = 0) and the stage centre
   * (m = 1), so it reads as that card opening up and folding back.
   */
  const morph = (
    panel: HTMLElement,
    panelW: number,
    from: NodeId,
    m: number,
    cam: { k: number; fx: number; fy: number },
  ) => {
    const node = DECK.find((n) => n.id === from)!;
    const ox = ((node.x - cam.fx) / 100) * box.w * cam.k;
    const oy = ((node.y - cam.fy) / 100) * box.h * cam.k;
    const s = lerp((nodeW * cam.k) / panelW, 1, m);
    style(
      panel,
      "transform",
      `translate(${(ox * (1 - m)).toFixed(1)}px, ${(oy * (1 - m)).toFixed(1)}px) scale(${s.toFixed(4)})`,
    );
    style(panel, "opacity", clamp01(m / 0.3).toFixed(3));
    attr(panel, "data-open", m > 0 ? "" : null);
  };

  const apply = (t: number) => {
    // Camera: in towards Memoization for the editor, back out for the library.
    const zoom = easeInOut(seg(t, 1, 1.3)) * (1 - easeInOut(seg(t, 2, 2.3)));
    const pull = easeInOut(seg(t, 5, 5.55));
    const cam = {
      k: lerp(1, 1.22, zoom) * lerp(1, 0.36, pull),
      fx: lerp(50, 55, zoom),
      fy: lerp(50, 40, zoom),
    };

    const editorM = easeInOut(seg(t, 1.02, 1.28)) * (1 - easeInOut(seg(t, 2.0, 2.24)));
    const reviewM = easeInOut(seg(t, 3.0, 3.14)) * (1 - easeInOut(seg(t, 3.54, 3.66)));
    const focus = Math.max(editorM, reviewM);

    const tx = (-(cam.fx - 50) * cam.k).toFixed(3);
    const ty = (-(cam.fy - 50) * cam.k).toFixed(3);
    style(camera, "transform", `translate(${tx}%, ${ty}%) scale(${cam.k.toFixed(4)})`);
    style(camera, "opacity", (1 - 0.65 * focus).toFixed(3));

    for (const node of DECK) {
      const el = nodes.get(node.id)!;
      attr(el, "data-state", deckState(node.id, t));
      // The card that opened into a panel hides while the panel stands for it.
      const hidden = node.id === "memo" ? editorM : node.id === "calls" ? reviewM : 0;
      style(el, "opacity", (1 - clamp01(hidden / 0.3)).toFixed(3));
    }
    attr(nodes.get("recursion")!, "data-pulse", t >= 2.26 && t < 2.5 ? "" : null);
    attr(nodes.get("tables")!, "data-pulse", t >= 2.44 && t < 2.68 ? "" : null);

    for (const [key, el] of baseEdges) style(el, "clip-path", reveal(linkProgress(key, t)));
    for (const [key, el] of litEdges) style(el, "clip-path", reveal(litProgress(key, t)));

    GRADED.forEach((g, i) => {
      const at = 3.6 + i * 0.11;
      const shown = easeOut(seg(t, at, at + 0.06)) * (1 - seg(t, 4.0, 4.06));
      style(chips[i]!, "opacity", shown.toFixed(3));
      style(chips[i]!, "transform", `translate(-50%, ${((1 - shown) * 6).toFixed(2)}px)`);
    });

    // Editor: the card is typed out, then saved.
    morph(editor, editorW, "memo", editorM, cam);
    const frontN = Math.round(seg(t, 1.28, 1.52) * typed.front.text.length);
    const backN = Math.round(seg(t, 1.54, 1.8) * typed.back.text.length);
    for (const [field, n] of [
      [typed.front, frontN],
      [typed.back, backN],
    ] as const) {
      text(field.el, field.text.slice(0, n));
      text(field.rest, field.text.slice(n));
    }
    attr(caretFront, "data-on", t >= 1.24 && t < 1.53 ? "" : null);
    attr(caretBack, "data-on", t >= 1.53 && t < 1.9 ? "" : null);
    attr(saveKey, "data-pressed", t >= 1.88 && t < 1.96 ? "" : null);

    // Review: Space shows the answer, 3 grades it Good.
    morph(review, reviewW, "calls", reviewM, cam);
    attr(spaceKey, "data-pressed", t >= 3.18 && t < 3.24 ? "" : null);
    const shownAnswer = easeOut(seg(t, 3.22, 3.34));
    style(answer, "clip-path", `inset(0 0 ${((1 - shownAnswer) * 100).toFixed(2)}% 0)`);
    attr(review, "data-flipped", t >= 3.3 ? "" : null);
    attr(goodKey, "data-pressed", t >= 3.44 && t < 3.52 ? "" : null);
    attr(goodKey, "data-chosen", t >= 3.44 ? "" : null);

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
        attr(edge.el, "data-lit", lit ? "" : null);
      }
    }

    text(status, statusAt(t));
    text(day, dayAt(t));
    attr(day, "data-on", t >= 3 && t < 5.1 ? "" : null);
  };

  return { measure, apply };
}
