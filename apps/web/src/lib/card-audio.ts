import { createContext, useContext } from "react";

/**
 * Card audio playback. Clips load through the same-origin `/media/<file>`
 * route (session-checked) into blob URLs, which every browser plays without
 * HTTP range support. One clip plays at a time across the app.
 *
 * A card side that plays audio is an {@link AudioGroup}: its clips in document
 * order. Review sides autoplay their group when they appear, and the replay
 * shortcut plays the group of the side shown last.
 */

const blobUrls = new Map<string, Promise<string>>();
/** The run playing now; starting another stops it. */
let current: { stop: () => void } | null = null;
const listeners = new Set<() => void>();
let playingSrc: string | null = null;

function notify() {
  for (const listener of listeners) listener();
}

export function subscribePlayback(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function playingClip() {
  return playingSrc;
}

function blobUrl(src: string) {
  let url = blobUrls.get(src);
  if (!url) {
    url = fetch(src, { credentials: "same-origin" }).then(async (response) => {
      if (!response.ok) throw new Error(`Audio unavailable (${response.status}).`);
      return URL.createObjectURL(await response.blob());
    });
    // A failed load can be retried on the next press.
    url.catch(() => blobUrls.delete(src));
    blobUrls.set(src, url);
  }
  return url;
}

export function stopAudio() {
  current?.stop();
}

/** Play clips one after another; resolves when they finish or something else starts. */
export async function playClips(sources: string[]) {
  stopAudio();
  let stopped = false;
  let audio: HTMLAudioElement | null = null;
  let finishClip: (() => void) | null = null;
  const run = {
    stop: () => {
      stopped = true;
      audio?.pause();
      finishClip?.();
    },
  };
  current = run;
  try {
    for (const src of sources) {
      let url: string;
      try {
        url = await blobUrl(src);
      } catch {
        continue;
      }
      if (stopped) return;
      const clip = new Audio(url);
      audio = clip;
      await new Promise<void>((resolve) => {
        finishClip = () => {
          finishClip = null;
          clip.onended = null;
          clip.onerror = null;
          playingSrc = null;
          notify();
          resolve();
        };
        clip.onended = finishClip;
        clip.onerror = finishClip;
        playingSrc = src;
        notify();
        // Autoplay can be blocked until the page has had a user gesture.
        clip.play().catch(() => finishClip?.());
      });
      if (stopped) return;
    }
  } finally {
    if (current === run) current = null;
  }
}

/** Sides waiting to autoplay until their first clip registers. */
const pendingAutoplay = new WeakSet<AudioGroup>();

/** The clips of one rendered card side. */
export class AudioGroup {
  readonly sources: string[] = [];

  register(src: string) {
    if (!this.sources.includes(src)) this.sources.push(src);
    if (pendingAutoplay.has(this)) {
      pendingAutoplay.delete(this);
      // Wait for the rest of the side's clips, which register in the same pass.
      queueMicrotask(() => void playClips([...this.sources]));
    }
    return () => {
      const index = this.sources.indexOf(src);
      if (index !== -1) this.sources.splice(index, 1);
    };
  }
}

/** Shown card sides, with when each last appeared; replay picks the latest. */
const groups = new Map<AudioGroup, number>();

/** Call each time a side appears (including a new card in the same place). */
export function trackGroup(group: AudioGroup) {
  groups.set(group, performance.now());
  return () => {
    groups.delete(group);
  };
}

/**
 * Play a side's clips as it appears. Clip buttons can register after the side
 * itself mounts, so a side with none yet plays when its first one arrives.
 */
export function autoplayGroup(group: AudioGroup) {
  if (group.sources.length > 0) {
    void playClips([...group.sources]);
    return () => {};
  }
  pendingAutoplay.add(group);
  return () => {
    pendingAutoplay.delete(group);
  };
}

/** Replay the audio of the card side that appeared last. */
export function replayCardAudio() {
  const latest = [...groups]
    .filter(([group]) => group.sources.length > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  if (latest) void playClips([...latest.sources]);
}

export const AudioGroupContext = createContext<AudioGroup | null>(null);

export function useAudioGroup() {
  return useContext(AudioGroupContext);
}
