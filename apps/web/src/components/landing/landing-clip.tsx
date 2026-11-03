import { useEffect, useRef } from "react";
import clips from "./clips.json";

/**
 * A short, silent clip of the real app, recorded by
 * apps/web/scripts/record-landing-clips.mjs. It loads and plays from the start
 * when it scrolls into view and pauses when it leaves. With reduced motion it
 * shows its last frame and plays only from its controls.
 */
export function LandingClip({ name, label }: { name: keyof typeof clips; label: string }) {
  const { width, height } = clips[name];
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // The poster stays up; the clip plays only from its controls.
      video.controls = true;
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          video.preload = "auto";
          video.currentTime = 0;
          video.play().catch(() => {
            // Autoplay can be refused (data saver, power saving); the poster stays.
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.45 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    // Never taller than the screen, so the whole clip is in view beside its text.
    <div
      className="mx-auto overflow-hidden border border-border-strong bg-surface shadow-overlay"
      style={{ maxWidth: `calc((100dvh - 9rem) * ${(width / height).toFixed(4)})` }}
    >
      <video
        ref={ref}
        className="block h-auto w-full bg-bg"
        width={width}
        height={height}
        poster={`/landing/${name}.jpg`}
        aria-label={label}
        muted
        loop
        playsInline
        preload="none"
      >
        <source src={`/landing/${name}.mp4`} type="video/mp4" />
      </video>
    </div>
  );
}
