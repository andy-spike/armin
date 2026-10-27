import { useMemo, useState, lazy, Suspense, type ComponentProps, type ReactNode } from "react";
import { Markdown, type MarkdownReactOptions } from "@tanstack/markdown/react";
import type { MarkdownExtension, UrlTransform } from "@tanstack/markdown";
import { cn } from "@/lib/utils";
import { mediaDisplayUrl } from "@/lib/media";
import { parseImageWidth, stripImageWidth } from "@/lib/image-size";
import { ImageZoomDialog } from "@/components/ui/image-zoom-dialog";
import { parseMediaRef } from "@armin/core/media-ref";
import { splitMath } from "@armin/core/math";

const MathEquation = lazy(() => import("./math-equation"));

function MathNode({ tex, display }: { tex: string; display: string }) {
  return (
    <Suspense fallback={<code>{tex}</code>}>
      <MathEquation tex={tex} display={display} />
    </Suspense>
  );
}

/** Protect math before Markdown's block/escape rules can change its source. */
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

/**
 * Card images are stored as `armin-media:` references to private library
 * media. Everything else keeps the parser's sanitised URL, which drops
 * script-capable schemes such as `javascript:`.
 */
const cardUrlTransform: UrlTransform = (url, kind, defaultUrl) =>
  kind === "image" && parseMediaRef(url) ? mediaDisplayUrl(url) : defaultUrl;

const TRAILING_PUNCTUATION = /[.,:;!?'"*_~]+$/;

/** Link node for an address shown as its own text. */
const linkTo = (href: string, text: string, length: number) => ({
  node: { type: "link" as const, href, children: [{ type: "text" as const, value: text }] },
  length,
});

/**
 * Links written as addresses, which the parser leaves as text while raw HTML
 * is off: CommonMark `<https://…>` autolinks (limited to web, mail, and phone
 * schemes) and GFM bare `https://…`, `http://…`, and `www.…` addresses, as
 * remark-gfm rendered them. Trailing punctuation and an unbalanced closing
 * parenthesis stay outside a bare link.
 */
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

const EXTENSIONS = [autolinks];

type MarkdownContentProps = {
  /** Markdown source to render read-only. */
  content: string;
  className?: string;
  /** In compact previews, replace images with numbered placeholders. */
  images?: "show" | "placeholder";
  /** Rendered after the Markdown, inside the same styled container. */
  children?: ReactNode;
};

function createComponents(
  images: MarkdownContentProps["images"],
  onPreview: (src: string) => void,
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
        ? // Numbered by a CSS counter (`.md-image-placeholder`) in document order.
          () => <span className="md-image-placeholder" />
        : // Apply the stored display width (encoded in the title) and let
          // clicking the image open the centered zoom preview.
          ({ src, alt, title }: ComponentProps<"img">) => {
            const rawTitle = typeof title === "string" ? title : null;
            const width = parseImageWidth(rawTitle);
            const caption = stripImageWidth(rawTitle);
            const source = typeof src === "string" ? src : "";
            if (!source) return null;
            return (
              <button
                type="button"
                className="md-image-zoom"
                aria-label="Preview image"
                onClick={() => onPreview(source)}
              >
                <img
                  src={source}
                  alt={alt ?? ""}
                  title={caption}
                  style={width ? { width, maxWidth: "100%" } : undefined}
                />
              </button>
            );
          },
  };
}

/**
 * Read-only renderer for the Markdown cards are authored in: CommonMark plus
 * the GFM tables, strikethrough, task lists, and autolinks cards use. Raw HTML
 * is shown as text. Styling lives under `.markdown-content`.
 */
export function MarkdownContent({
  content,
  className,
  images = "show",
  children,
}: MarkdownContentProps) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const components = useMemo(() => createComponents(images, setPreviewSrc), [images]);

  const math = useMemo(() => mathDocument(content), [content]);

  return (
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
  );
}
