import { PrivateCardImage } from "./private-card-image";
import {
  useEffect,
  useMemo,
  useState,
  lazy,
  Suspense,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Markdown, type MarkdownReactOptions } from "@tanstack/markdown/react";
import type { MarkdownExtension, UrlTransform } from "@tanstack/markdown";
import { cn } from "@/lib/utils";
import { mediaDisplayUrl } from "@/lib/media";
import { parseImageWidth, stripImageWidth } from "@/lib/image-size";
import { ImageZoomDialog } from "@/components/ui/image-zoom-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { parseMediaRef } from "@armin/core/media-ref";
import { isAudioFile } from "@armin/core/media";
import { CardAudio, CardAudioPlaceholder } from "@/components/ui/card-audio";
import {
  AudioGroup,
  AudioGroupContext,
  autoplayGroup,
  stopAudioOf,
  trackGroup,
} from "@/lib/card-audio";
import { inlineMarks } from "@/lib/markdown-marks";
import { splitMath } from "@armin/core/math";

const MathEquation = lazy(() => import("./math-equation"));

function MathNode({ tex, display }: { tex: string; display: string }) {
  return (
    <Suspense fallback={<code>{tex}</code>}>
      <MathEquation tex={tex} display={display} />
    </Suspense>
  );
}

function mathDocument(content: string) {
  const parts = splitMath(content);
  let marker = "\uE000math";
  while (content.includes(marker)) marker += "x";
  const equations: { tex: string; display: boolean }[] = [];
  const source = parts
    .map((part) => {
      if (part.kind === "text") return part.raw;
      equations.push(part);
      return `${marker}${equations.length - 1}\uE001`;
    })
    .join("");
  const math: MarkdownExtension = {
    name: "math",
    inlineParser: {
      markers: "\uE000",
      parse: ({ source: text, index }) => {
        if (!text.startsWith(marker, index)) return undefined;
        const match = /^(\d+)\uE001/.exec(text.slice(index + marker.length));
        const equation = match && equations[Number(match[1])];
        if (!equation) return undefined;
        return {
          node: {
            type: "inlineComponent",
            name: "MathEquation",
            tagName: "armin-math",
            attributes: {},
            properties: {
              tex: equation.tex,
              display: String(equation.display),
            },
            children: [],
          },
          length: marker.length + match![0].length,
        };
      },
    },
  };
  return { source, extensions: [...EXTENSIONS, math] };
}

const cardUrlTransform: UrlTransform = (url, kind, defaultUrl) =>
  kind === "image" && parseMediaRef(url) ? mediaDisplayUrl(url) : defaultUrl;

const TRAILING_PUNCTUATION = /[.,:;!?'"*_~]+$/;

const linkTo = (href: string, text: string, length: number) => ({
  node: { type: "link" as const, href, children: [{ type: "text" as const, value: text }] },
  length,
});

const autolinks: MarkdownExtension = {
  name: "autolinks",
  inlineParser: {
    markers: "<hHwW",
    parse: ({ source, index, inLink }) => {
      if (inLink) return undefined;
      const rest = source.slice(index);
      if (rest.startsWith("<")) {
        const angle = /^<((?:https?:\/\/|mailto:|tel:)[^\s<>]+)>/i.exec(rest);
        return angle ? linkTo(angle[1]!, angle[1]!, angle[0].length) : undefined;
      }
      if (/[\p{L}\p{N}]/u.test(source[index - 1] ?? "")) return undefined;
      const match = /^(?:https?:\/\/|www\.)[^\s<>]+/i.exec(rest);
      if (!match) return undefined;
      let text = match[0];
      for (;;) {
        const trimmed = text.replace(TRAILING_PUNCTUATION, "");
        const opens = trimmed.split("(").length;
        const closes = trimmed.split(")").length;
        const next = trimmed.endsWith(")") && closes > opens ? trimmed.slice(0, -1) : trimmed;
        if (next === text) break;
        text = next;
      }
      if (/^www\.$/i.test(text) || /^https?:\/\/$/i.test(text)) return undefined;
      return linkTo(/^www\./i.test(text) ? `http://${text}` : text, text, text.length);
    },
  },
};

const EXTENSIONS = [autolinks, inlineMarks];

type MarkdownContentProps = {
  content: string;
  className?: string;
  images?: "show" | "placeholder";
  imageLoading?: "eager" | "lazy";
  audio?: "autoplay" | "manual";
  children?: ReactNode;
};

function createComponents(
  images: MarkdownContentProps["images"],
  onPreview: (src: string) => void,
  imageLoading: "eager" | "lazy",
): NonNullable<MarkdownReactOptions["components"]> {
  return {
    "armin-math": MathNode,
    a: ({ children, href, ...props }: ComponentProps<"a">) => (
      <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
        {children}
      </a>
    ),
    img:
      images === "placeholder"
        ? ({ src }: ComponentProps<"img">) =>
            typeof src === "string" && isAudioFile(src) ? (
              <CardAudioPlaceholder />
            ) : (
              <span className="md-image-placeholder" />
            )
        : ({ src, alt, title }: ComponentProps<"img">) => {
            const source = typeof src === "string" ? src : "";
            if (isAudioFile(source)) return <CardAudio src={source} />;
            const rawTitle = typeof title === "string" ? title : null;
            const width = parseImageWidth(rawTitle);
            const caption = stripImageWidth(rawTitle);
            if (!source) return null;
            return (
              <Tooltip content={caption} disabled={!caption} className="px-2.5 py-1.5">
                <button
                  type="button"
                  className="md-image-zoom"
                  aria-label="Preview image"
                  onClick={() => onPreview(source)}
                >
                  <PrivateCardImage
                    src={source}
                    alt={alt ?? ""}
                    width={width}
                    loading={imageLoading}
                  />
                </button>
              </Tooltip>
            );
          },
  };
}

export function MarkdownContent({
  content,
  className,
  images = "show",
  imageLoading = "lazy",
  audio,
  children,
}: MarkdownContentProps) {
  const group = useMemo(() => (audio ? new AudioGroup() : null), [audio]);
  useEffect(() => {
    if (!group) return;
    const untrack = trackGroup(group);
    const cancelAutoplay = audio === "autoplay" ? autoplayGroup(group) : () => {};
    return () => {
      untrack();
      cancelAutoplay();
      stopAudioOf(group);
    };
  }, [group, audio, content]);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const components = useMemo(
    () => createComponents(images, setPreviewSrc, imageLoading),
    [images, imageLoading],
  );

  const math = useMemo(() => mathDocument(content), [content]);

  return (
    <AudioGroupContext.Provider value={group}>
      <div className={cn("markdown-content", className)}>
        <Markdown
          components={components}
          urlTransform={cardUrlTransform}
          extensions={math.extensions}
          headingIds={false}
        >
          {math.source}
        </Markdown>
        {children}
        {images === "show" && (
          <ImageZoomDialog
            src={previewSrc}
            open={previewSrc !== null}
            onClose={() => setPreviewSrc(null)}
          />
        )}
      </div>
    </AudioGroupContext.Provider>
  );
}
