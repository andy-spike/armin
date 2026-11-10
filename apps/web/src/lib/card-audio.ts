import { createContext, useContext } from "react";

const blobUrls = new Map<string, Promise<string>>();
const MAX_CACHED_CLIPS = 32;
let current: { stop: () => void; owner: object | null } | null = null;
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
  if (url) {
    blobUrls.delete(src);
    blobUrls.set(src, url);
  } else {
    url = fetch(src, { credentials: "same-origin" }).then(async (response) => {
      if (!response.ok) throw new Error(`Audio unavailable (${response.status}).`);
      return URL.createObjectURL(await response.blob());
    });
    url.catch(() => blobUrls.delete(src));
    blobUrls.set(src, url);
    for (const [oldSrc, oldUrl] of blobUrls) {
      if (blobUrls.size <= MAX_CACHED_CLIPS) break;
      if (oldSrc === playingSrc) continue;
      blobUrls.delete(oldSrc);
      void oldUrl.then(
        (expired) => URL.revokeObjectURL(expired),
        () => {},
      );
    }
  }
  return url;
}

export function stopAudio() {
  current?.stop();
}

export function stopAudioOf(owner: object) {
  if (current?.owner === owner) current.stop();
}

export async function playClips(sources: string[], owner: object | null = null) {
  stopAudio();
  let stopped = false;
  let audio: HTMLAudioElement | null = null;
  let finishClip: (() => void) | null = null;
  const run = {
    owner,
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
        clip.play().catch(() => finishClip?.());
      });
      if (stopped) return;
    }
  } finally {
    if (current === run) current = null;
  }
}

const pendingAutoplay = new WeakSet<AudioGroup>();

export class AudioGroup {
  readonly sources: string[] = [];

  register(src: string) {
    if (!this.sources.includes(src)) this.sources.push(src);
    if (pendingAutoplay.has(this)) {
      pendingAutoplay.delete(this);
      queueMicrotask(() => void playClips([...this.sources], this));
    }
    return () => {
      const index = this.sources.indexOf(src);
      if (index !== -1) this.sources.splice(index, 1);
    };
  }
}

const groups = new Map<AudioGroup, number>();

export function trackGroup(group: AudioGroup) {
  groups.set(group, performance.now());
  return () => {
    groups.delete(group);
  };
}

export function autoplayGroup(group: AudioGroup) {
  if (group.sources.length > 0) {
    void playClips([...group.sources], group);
    return () => {};
  }
  pendingAutoplay.add(group);
  return () => {
    pendingAutoplay.delete(group);
  };
}

export function replayCardAudio() {
  const latest = [...groups]
    .filter(([group]) => group.sources.length > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  if (latest) void playClips([...latest.sources], latest);
}

export const AudioGroupContext = createContext<AudioGroup | null>(null);

export function useAudioGroup() {
  return useContext(AudioGroupContext);
}
