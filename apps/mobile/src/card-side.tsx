import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View, type TextStyle } from "react-native";
import { ImageOff } from "lucide-react-native";
import { parseMediaRef } from "@armin/core/media-ref";
import { convexToken } from "./lib/auth-client";
import { convexSiteUrl } from "./lib/env";
import { space, type, useTheme } from "./theme";
import { Skeleton } from "./ui";

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(([^)\s]+)\)/g;

/** Card text with Markdown images pulled out and loaded privately. */
export function CardSide({ text, textStyle }: { text: string; textStyle: TextStyle }) {
  const theme = useTheme();
  const images = [...text.matchAll(MARKDOWN_IMAGE)]
    .map((match) => parseMediaRef(match[1]))
    .filter((fileName): fileName is string => Boolean(fileName));
  const plain = text.replace(MARKDOWN_IMAGE, "").trim();
  return (
    <View style={styles.side}>
      {plain.length > 0 && (
        <Text selectable style={[textStyle, styles.text, { color: theme.ink }]}>
          {plain}
        </Text>
      )}
      {images.map((fileName) => (
        <PrivateImage key={fileName} fileName={fileName} />
      ))}
    </View>
  );
}

/**
 * Images are never public URLs: each request carries the session's Convex
 * token and the backend checks the image belongs to the caller's library.
 * The bytes are fetched here because Android's Image drops custom headers.
 */
function PrivateImage({ fileName }: { fileName: string }) {
  const theme = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await convexToken();
        if (!token) throw new Error("Signed out");
        const response = await fetch(`${convexSiteUrl}/media/${fileName}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get("content-type") ?? "image/png";
        const dataUri = `data:${contentType};base64,${toBase64(await response.arrayBuffer())}`;
        if (active) setUri(dataUri);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [fileName]);

  if (failed) {
    return (
      <View style={[styles.image, styles.missing, { backgroundColor: theme.bg2 }]}>
        <ImageOff size={20} color={theme.muted} strokeWidth={1.5} />
        <Text style={[type.caption, { color: theme.muted }]}>Image unavailable</Text>
      </View>
    );
  }
  if (!uri) return <Skeleton style={styles.image} />;
  return (
    <Image
      accessibilityLabel="Flashcard image"
      style={[styles.image, { backgroundColor: theme.bg2 }]}
      resizeMode="contain"
      source={{ uri }}
    />
  );
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const styles = StyleSheet.create({
  side: { width: "100%", alignItems: "center", gap: space.md },
  text: { textAlign: "center", maxWidth: 560 },
  image: { width: "100%", height: 200 },
  missing: { alignItems: "center", justifyContent: "center", gap: space.sm },
});
