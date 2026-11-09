import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LANDING_ACCOUNT,
  WRITTEN_CARD,
  prepareLandingDemo,
} from "../../../packages/backend/scripts/landing-demo.mjs";

const SESSION = "armin-landing-clips";
const out = fileURLToPath(new URL("../public/landing/", import.meta.url));
const manifest = fileURLToPath(new URL("../src/components/landing/clips.json", import.meta.url));
const raw = join(out, ".raw");
const SCHEMES = ["dark", "light"];
const WIDTH = 1280;
const HEIGHT = 800;
const SCALE = 1.5;
const SPEED = 1.2;
const MAX_WIDTH = 1440;

const ab = (...args) =>
  execFileSync("agent-browser", [...args, "--session", SESSION], { encoding: "utf8" }).trim();
const wait = (ms) => ab("wait", String(ms));
const evaluate = (js) => JSON.parse(JSON.parse(ab("eval", `JSON.stringify(${js})`)));

function rect(find) {
  const box = evaluate(`(() => {
    const el = ${find};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  })()`);
  if (!box) throw new Error(`Nothing on the page matched ${find}`);
  return box;
}
function centre(find, dx = 0, dy = 0) {
  const box = rect(find);
  return {
    x: Math.round((box.left + box.right) / 2 + dx),
    y: Math.round((box.top + box.bottom) / 2 + dy),
  };
}
const byText = (selector, text, scope = "document") =>
  `[...${scope}.querySelectorAll(${JSON.stringify(selector)})].find((el) => el.textContent.trim().startsWith(${JSON.stringify(text)}))`;
const graphNode = (text) =>
  `[...document.querySelectorAll(".react-flow__node")].find((el) => el.textContent.includes(${JSON.stringify(text)}))`;

function frame(finds, pad = 28) {
  const boxes = finds.map(rect);
  const left = Math.min(...boxes.map((b) => b.left)) - pad;
  const right = Math.max(...boxes.map((b) => b.right)) + pad;
  const top = Math.min(...boxes.map((b) => b.top)) - pad;
  const bottom = Math.max(...boxes.map((b) => b.bottom)) + pad;
  const shift = (lo, hi, max) => (lo < 0 ? -lo : hi > max ? max - hi : 0);
  const dx = shift(left, right, WIDTH);
  const dy = shift(top, bottom, HEIGHT);
  return {
    left: Math.max(0, left + dx),
    top: Math.max(0, top + dy),
    width: Math.min(WIDTH, right - left),
    height: Math.min(HEIGHT, bottom - top),
  };
}

const move = ({ x, y }, duration = 600) =>
  ab("mouse", "move", String(x), String(y), "--human", "--duration", String(duration));
function click(point, duration) {
  move(point, duration);
  wait(120);
  ab("mouse", "down");
  wait(80);
  ab("mouse", "up");
}
function typeQuickly(text) {
  const words = text.split(/(?<= )/);
  for (let i = 0; i < words.length; i += 3) ab("keyboard", "type", words.slice(i, i + 3).join(""));
}

const sizes = {};
let scheme = "dark";
function startClip(name) {
  ab("record", "start", join(raw, `${name}-${scheme}.mp4`), "--cursor", "--fps", "30");
}
function stopClip(name, crop) {
  ab("record", "stop");
  const source = join(raw, `${name}-${scheme}.mp4`);
  const recorded = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width",
      "-of",
      "csv=p=0",
      source,
    ]).toString(),
  );
  const k = recorded / WIDTH;
  const even = (n) => Math.round(n / 2) * 2;
  const width = even(Math.min(MAX_WIDTH, crop.width * k));
  const height = even((width * crop.height) / crop.width);
  const previous = sizes[name];
  if (previous && (previous.width !== width || previous.height !== height)) {
    console.warn(
      `The ${scheme} ${name} clip is ${width}×${height}, the other ${previous.width}×${previous.height}.`,
    );
  }
  sizes[name] = { width, height };
  const target = join(out, `${name}-${scheme}.mp4`);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    source,
    "-an",
    "-vf",
    [
      `crop=${even(crop.width * k)}:${even(crop.height * k)}:${Math.round(crop.left * k)}:${Math.round(crop.top * k)}`,
      `scale=${width}:${height}:flags=lanczos`,
      `setpts=PTS/${SPEED}`,
    ].join(","),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    target,
  ]);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-sseof",
    "-0.1",
    "-i",
    target,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    join(out, `${name}-${scheme}.jpg`),
  ]);
}

function openGraph(site, deckPath) {
  ab("open", `${site}${deckPath}/graph`);
  wait(2000);
  ab("click", '[aria-label="Fit view"]');
  wait(600);
  move({ x: 1180, y: 700 }, 10);
}

async function main() {
  mkdirSync(raw, { recursive: true });
  try {
    for (const next of SCHEMES) {
      scheme = next;
      console.log(`Recording the ${scheme} clips`);
      await recordScheme();
    }
  } finally {
    rmSync(raw, { recursive: true, force: true });
  }
  writeFileSync(manifest, `${JSON.stringify(sizes, null, 2)}\n`);
  console.log(`Wrote the landing clips to ${out}`);
}

async function recordScheme() {
  const demo = await prepareLandingDemo();
  const site = demo.siteUrl;
  try {
    ab("close");
  } catch {}
  ab("set", "viewport", String(WIDTH), String(HEIGHT), String(SCALE));
  ab("set", "media", scheme);
  ab("open", `${site}/sign-in`);
  ab("wait", "input[type=email]");
  ab("fill", "input[type=email]", LANDING_ACCOUNT.email);
  ab("fill", "input[type=password]", LANDING_ACCOUNT.password);
  ab("press", "Enter");
  wait(2500);

  try {
    ab("open", `${site}${demo.deckPath}`);
    wait(2000);
    const addCard = byText("button", "Add card");
    click(centre(addCard), 10);
    wait(800);
    const writeFrame = frame([addCard, 'document.querySelector("[role=dialog]")'], 20);
    ab("press", "Escape");
    wait(800);
    move({ x: 700, y: 400 }, 10);
    startClip("write");
    wait(600);
    click(centre(addCard), 700);
    wait(700);
    click(centre('document.querySelector("[aria-label=\\"Flashcard front\\"]")'), 500);
    typeQuickly(WRITTEN_CARD.front);
    wait(300);
    click(centre('document.querySelector("[aria-label=\\"Flashcard back\\"]")'), 500);
    typeQuickly(WRITTEN_CARD.back);
    wait(500);
    click(centre(byText("button", "Add card", 'document.querySelector("[role=dialog]")')), 600);
    wait(1500);
    stopClip("write", writeFrame);

    await demo.afterWrittenCard();

    openGraph(site, demo.deckPath);
    const linkFrame = frame(
      [
        "What is a token?",
        "What is an embedding?",
        WRITTEN_CARD.front,
        "What makes up a transformer block?",
      ].map(graphNode),
    );
    startClip("link");
    wait(700);
    for (const prereq of ["What is a token?", "What is an embedding?"]) {
      move(centre(graphNode(prereq)), 600);
      wait(200);
      move(
        centre(
          `${graphNode(prereq)}?.querySelector('.card-graph-handle[data-handleid="bottom"]')`,
          0,
          -3,
        ),
        350,
      );
      wait(150);
      ab("mouse", "down");
      wait(100);
      move(centre(graphNode(WRITTEN_CARD.front), 0, 10), 900);
      wait(150);
      ab("mouse", "up");
      wait(1000);
    }
    wait(900);
    stopClip("link", linkFrame);

    await demo.beforeReview();

    ab("open", `${site}${demo.deckPath}/review`);
    wait(2000);
    const reviewFrame = frame(
      [
        byText("h1", "Review"),
        `${byText("button", "Show answer")}?.closest(".flex-1")?.parentElement`,
      ],
      24,
    );
    move({ x: 1000, y: 650 }, 10);
    startClip("review");
    for (let i = 0; i < 2; i++) {
      wait(1100);
      click(centre(byText("button", "Show answer")), 600);
      wait(1300);
      click(centre(byText("button", "Easy")), 600);
    }
    wait(1100);
    stopClip("review", reviewFrame);

    openGraph(site, demo.deckPath);
    const nodeCount = evaluate('document.querySelectorAll(".react-flow__node").length');
    const unlockFrame = frame(
      Array.from(
        { length: nodeCount },
        (_, i) => `document.querySelectorAll(".react-flow__node")[${i}]`,
      ),
    );
    startClip("unlock");
    wait(900);
    move(centre(graphNode(WRITTEN_CARD.front)), 800);
    wait(1700);
    move(centre(graphNode("What is a context window?")), 700);
    wait(1600);
    move(centre(graphNode("What makes up a transformer block?")), 700);
    wait(1500);
    stopClip("unlock", unlockFrame);
  } finally {
    ab("close");
    await demo.signOut();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
