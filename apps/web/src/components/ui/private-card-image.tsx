import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@armin/backend/api";

/** Display previews stay authenticated; zoom uses the caller's original URL. */
export function PrivateCardImage({
  src,
  alt,
  width,
  loading,
}: {
  src: string;
  alt: string;
  width: number | null;
  loading: "eager" | "lazy";
}) {
  const fileName = src.startsWith("/media/") ? src.slice("/media/".length).split("?")[0]! : "";
  const metadata = useQuery({
    ...convexQuery(api.media.dimensions, { fileName }),
    enabled: Boolean(fileName),
    gcTime: 30_000,
  });
  const dimensions = metadata.data;
  return (
    <img
      src={dimensions?.preview ? `${src}?preview=1` : src}
      alt={alt}
      width={dimensions?.width}
      height={dimensions?.height}
      loading={loading}
      decoding="async"
      style={{
        ...(width ? { width, maxWidth: "100%" } : {}),
        ...(dimensions?.width && dimensions.height
          ? { aspectRatio: `${dimensions.width} / ${dimensions.height}`, height: "auto" }
          : {}),
      }}
    />
  );
}
