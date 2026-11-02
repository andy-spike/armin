import { useEffect, useSyncExternalStore } from "react";
import { Square, Volume2 } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import {
  playClips,
  playingClip,
  stopAudio,
  subscribePlayback,
  useAudioGroup,
} from "@/lib/card-audio";

/**
 * An audio clip in card content (`![audio](armin-media:<sha>.mp3)`): a play
 * button that stops again while playing. Inside a card side that plays audio,
 * the clip joins that side's autoplay and replay group.
 */
export function CardAudio({ src }: { src: string }) {
  const group = useAudioGroup();
  useEffect(() => group?.register(src), [group, src]);
  const playing = useSyncExternalStore(subscribePlayback, playingClip, () => null) === src;
  const label = playing ? "Stop audio" : "Play audio";
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={playing}
        onClick={(event) => {
          // Cards and tiles can be clickable; playing audio shouldn't also open or flip them.
          event.stopPropagation();
          if (playing) stopAudio();
          else void playClips([src]);
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

/** Compact previews show that a card has audio without playing it. */
export function CardAudioPlaceholder() {
  return (
    <span className="md-audio-placeholder" role="img" aria-label="Audio">
      <Volume2 className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}
