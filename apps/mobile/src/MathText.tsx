import { useMemo, useState } from "react";
import { WebView } from "react-native-webview";
import katex from "katex";
import "katex/contrib/mhchem";
import { splitMath } from "@armin/core/math";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render KaTeX as native browser MathML, keeping all other card text inert. */
export function MathText({ text }: { text: string }) {
  const [height, setHeight] = useState(80);
  const html = useMemo(() => {
    const body = splitMath(text)
      .map((part) => {
        if (part.kind === "text") return escapeHtml(part.raw);
        try {
          return katex.renderToString(part.tex, {
            output: "mathml",
            displayMode: part.display,
            throwOnError: true,
            trust: false,
            strict: "ignore",
            maxExpand: 1000,
            maxSize: 20,
            macros: {},
          });
        } catch {
          return escapeHtml(part.raw);
        }
      })
      .join("");
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0}body{font:18px/1.5 sans-serif;color:#262626;white-space:pre-wrap;overflow-wrap:anywhere}math[display=block]{overflow-x:auto}</style></head><body>${body}</body></html>`;
  }, [text]);
  return (
    <WebView
      originWhitelist={["about:blank"]}
      source={{ html }}
      scrollEnabled={false}
      style={{ height, backgroundColor: "transparent" }}
      onMessage={(event) => {
        const next = Number(event.nativeEvent.data);
        if (Number.isFinite(next) && next > 0) setHeight(Math.ceil(next));
      }}
      injectedJavaScript={
        "window.ReactNativeWebView.postMessage(String(document.body.scrollHeight)); true;"
      }
      onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
    />
  );
}
