import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import clips from "./clips.json";

/** Each clip is recorded in both schemes; CSS shows the one matching the theme. */
const SCHEMES = [
  { scheme: "light", className: "[[data-theme=dark]_&]:hidden" },
  { scheme: "dark", className: "hidden [[data-theme=dark]_&]:block" },
] as const;

/**
 * A short, silent clip of the real app, recorded by
 * apps/web/scripts/record-landing-clips.mjs in light and dark mode. Only the
 * clip for the current theme is displayed; the other is `display: none`, so it
 * never intersects, loads, or plays. The displayed one loads and plays from
 * the start when it scrolls into view and pauses when it leaves, which also
 * swaps playback over when the theme changes. With reduced motion it shows its
 * last frame and plays only from its controls.
 */
export function LandingClip({ name, label }: { name: keyof typeof clips; label: string }) {
  const { width, height } = clips[name];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const videos = [...(ref.current?.querySelectorAll("video") ?? [])];
    if (videos.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // The poster stays up; the clip plays only from its controls.
      for (const video of videos) video.controls = true;
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            video.preload = "auto";
            video.currentTime = 0;
            video.play().catch(() => {
              // Autoplay can be refused (data saver, power saving); the poster stays.
            });
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.45 },
    );
    for (const video of videos) observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    // Never taller than the screen, so the whole clip is in view beside its text.
    <div
      ref={ref}
      className="mx-auto overflow-hidden border border-border-strong bg-surface shadow-overlay"
      style={{ maxWidth: `calc((100dvh - 9rem) * ${(width / height).toFixed(4)})` }}
    >
      {SCHEMES.map(({ scheme, className }) => (
        <video
          key={scheme}
          className={cn("h-auto w-full bg-bg", className)}
          width={width}
          height={height}
          poster={`/landing/${name}-${scheme}.jpg`}
          aria-label={label}
          muted
          loop
          playsInline
          preload="none"
        >
          <source src={`/landing/${name}-${scheme}.mp4`} type="video/mp4" />
        </video>
      ))}
    </div>
  );
}
