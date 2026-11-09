import { renderMath } from "@armin/core/math-render";
import "katex/dist/katex.min.css";

export default function MathEquation({ tex, display }: { tex: string; display: string }) {
  const result = renderMath(tex, display === "true");
  if (result.error) {
    return (
      <span className="math-error">
        <code>{tex}</code>
        <span className="math-warning" role="status">
          {result.error}
        </span>
      </span>
    );
  }
  return (
    <span
      className={display === "true" ? "math-display" : "math-inline"}
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}
