import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import clips from "./clips.json";

const SCHEMES = [
  { scheme: "light", className: "[[data-theme=dark]_&]:hidden" },
  { scheme: "dark", className: "hidden [[data-theme=dark]_&]:block" },
] as const;

export function LandingClip({ name, label }: { name: keyof typeof clips; label: string }) {
  const { width, height } = clips[name];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const videos = [...(ref.current?.querySelectorAll("video") ?? [])];
    if (videos.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
            video.play().catch(() => {});
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
