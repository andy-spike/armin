import { useEffect, useRef, useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import {
  playClips,
  playingClip,
  stopAudio,
  stopAudioOf,
  subscribePlayback,
  useAudioGroup,
} from "@/lib/card-audio";

export function CardAudio({ src }: { src: string }) {
  const group = useAudioGroup();
  useEffect(() => group?.register(src), [group, src]);
  const button = useRef({});
  useEffect(() => {
    const owner = button.current;
    return () => stopAudioOf(owner);
  }, []);
  const playing = useSyncExternalStore(subscribePlayback, playingClip, () => null) === src;
  const label = playing ? "Stop audio" : "Play audio";
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={playing}
        onClick={(event) => {
          event.stopPropagation();
          if (playing) stopAudio();
          else void playClips([src], group ?? button.current);
        }}
        className="md-audio"
        data-playing={playing || undefined}
      >
        {playing ? (
          <Square className="h-3.5 w-3.5" aria-hidden fill="currentColor" />
        ) : (
          <Volume2 className="h-4 w-4" aria-hidden />
        )}
      </button>
    </Tooltip>
  );
}

export function CardAudioPlaceholder() {
  return (
    <span className="md-audio-placeholder" role="img" aria-label="Audio">
      <Volume2 className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}
