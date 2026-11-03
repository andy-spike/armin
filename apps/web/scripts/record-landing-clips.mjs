// Records the landing page's four clips from the real app, in dark mode:
// writing a card, linking it in the graph, reviewing, and the unlocked graph.
//
//   pnpm --filter @armin/web landing:clips
//
// Needs `pnpm dev` running in this checkout, agent-browser, and ffmpeg. Each
// run resets the "Fundamentals of LLMs" deck in its own demo account on this
// checkout's local deployment, then writes MP4s and posters to
// apps/web/public/landing/.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LANDING_ACCOUNT,
  WRITTEN_CARD,
  prepareLandingDemo,
} from "../../../packages/backend/scripts/landing-demo.mjs";

const SESSION = "armin-landing-clips";
const out = fileURLToPath(new URL("../public/landing/", import.meta.url));
const raw = join(out, ".raw");
const VIEWPORT = ["1280", "800", "1.5"];

const ab = (...args) =>
  execFileSync("agent-browser", [...args, "--session", SESSION], { encoding: "utf8" }).trim();
const wait = (ms) => ab("wait", String(ms));
const evaluate = (js) => JSON.parse(JSON.parse(ab("eval", `JSON.stringify(${js})`)));

/** The centre of the first element the expression returns, in CSS pixels. */
function centre(find, dx = 0, dy = 0) {
  const box = evaluate(`(() => {
    const el = ${find};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!box) throw new Error(`Nothing on the page matched ${find}`);
  return { x: Math.round(box.x + dx), y: Math.round(box.y + dy) };
}
const byText = (selector, text, scope = "document") =>
  `[...${scope}.querySelectorAll(${JSON.stringify(selector)})].find((el) => el.textContent.trim().startsWith(${JSON.stringify(text)}))`;
const graphNode = (text) =>
  `[...document.querySelectorAll(".react-flow__node")].find((el) => el.textContent.includes(${JSON.stringify(text)}))`;

const move = ({ x, y }, duration = 700) =>
  ab("mouse", "move", String(x), String(y), "--human", "--duration", String(duration));
function click(point, duration) {
  move(point, duration);
  wait(150);
  ab("mouse", "down");
  wait(90);
  ab("mouse", "up");
}
/** Types a few words at a time, so the text appears at a quick typing pace. */
function typeSlowly(text) {
  const words = text.split(/(?<= )/);
  for (let i = 0; i < words.length; i += 3) ab("keyboard", "type", words.slice(i, i + 3).join(""));
}

function startClip(name) {
  ab("record", "start", join(raw, `${name}.mp4`), "--cursor", "--fps", "30");
}
function stopClip(name) {
  ab("record", "stop");
  const source = join(raw, `${name}.mp4`);
  // Small, widely playable H.264 with no audio track, ready to stream.
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    source,
    "-an",
    "-vf",
    "scale=1920:-2:flags=lanczos",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "26",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    join(out, `${name}.mp4`),
  ]);
  // The poster is the clip's last frame: what reduced motion shows.
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-sseof",
    "-0.2",
    "-i",
    source,
    "-frames:v",
    "1",
    "-vf",
    "scale=1920:-2:flags=lanczos",
    "-q:v",
    "4",
    join(out, `${name}.jpg`),
  ]);
}

/** Opens the deck graph framed on every card, with the pointer out of the way. */
function openGraph(site, deckPath) {
  ab("open", `${site}${deckPath}/graph`);
  wait(2000);
  ab("click", '[aria-label="Fit view"]');
  wait(600);
  move({ x: 1180, y: 700 }, 10);
}

async function main() {
  mkdirSync(raw, { recursive: true });
  const demo = await prepareLandingDemo();
  const site = demo.siteUrl;
  try {
    ab("close");
  } catch {
    // No earlier session to close.
  }
  ab("set", "viewport", ...VIEWPORT);
  ab("set", "media", "dark");
  ab("open", `${site}/sign-in`);
  wait(1200);
  ab("fill", "input[type=email]", LANDING_ACCOUNT.email);
  ab("fill", "input[type=password]", LANDING_ACCOUNT.password);
  ab("press", "Enter");
  wait(2500);

  try {
    // 1. Write a card: Add card, type the front and back, save.
    ab("open", `${site}${demo.deckPath}`);
    wait(2000);
    move({ x: 900, y: 600 }, 10);
    startClip("write");
    wait(900);
    click(centre(byText("button", "Add card")), 900);
    wait(900);
    click(centre('document.querySelector("[aria-label=\\"Flashcard front\\"]")'), 700);
    typeSlowly(WRITTEN_CARD.front);
    wait(500);
    click(centre('document.querySelector("[aria-label=\\"Flashcard back\\"]")'), 600);
    typeSlowly(WRITTEN_CARD.back);
    wait(700);
    click(centre(byText("button", "Add card", 'document.querySelector("[role=dialog]")')), 800);
    wait(2200);
    stopClip("write");

    await demo.afterWrittenCard();

    // 2. Link it: drag from each prerequisite's lower handle onto the new card.
    openGraph(site, demo.deckPath);
    startClip("link");
    wait(1000);
    for (const prereq of ["What is a token?", "What is an embedding?"]) {
      move(centre(graphNode(prereq)), 800);
      wait(300);
      // The card clips its handles to their inner half, so press just inside.
      move(
        centre(
          `${graphNode(prereq)}?.querySelector('.card-graph-handle[data-handleid="bottom"]')`,
          0,
          -3,
        ),
        400,
      );
      wait(200);
      ab("mouse", "down");
      wait(150);
      move(centre(graphNode(WRITTEN_CARD.front), 0, 10), 1200);
      wait(200);
      ab("mouse", "up");
      wait(1300);
    }
    move({ x: 1180, y: 700 }, 800);
    wait(1200);
    stopClip("link");

    // 3. Review: show each foundation's answer and grade it Easy.
    ab("open", `${site}${demo.deckPath}/review`);
    wait(2000);
    move({ x: 1000, y: 650 }, 10);
    startClip("review");
    for (let i = 0; i < 2; i++) {
      wait(1500);
      click(centre(byText("button", "Show answer")), 700);
      wait(1600);
      click(centre(byText("button", "Easy")), 700);
    }
    wait(1500);
    stopClip("review");

    // 4. Unlock: the graph after review; the new card and Context window opened.
    openGraph(site, demo.deckPath);
    startClip("unlock");
    wait(1200);
    move(centre(graphNode(WRITTEN_CARD.front)), 1000);
    wait(2200);
    move(centre(graphNode("What is a context window?")), 900);
    wait(2000);
    move(centre(graphNode("What makes up a transformer block?")), 900);
    wait(2000);
    move({ x: 1180, y: 700 }, 800);
    wait(800);
    stopClip("unlock");
  } finally {
    ab("close");
    rmSync(raw, { recursive: true, force: true });
    await demo.signOut();
  }
  console.log(`Wrote the landing clips to ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
