import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import { editorViewOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { formatImageTitle, parseImageWidth, stripImageWidth } from "@/lib/image-size";

/** Keep Armin's portable image format; Crepe otherwise writes resize ratios as alt text. */
export function configureCardImages(ctx: Ctx, onPreview: (src: string) => void) {
  ctx.update(imageBlockSchema.key, (previous) => (context) => ({
    ...previous(context),
    attrs: {
      src: { default: "" },
      alt: { default: "" },
      caption: { default: "" },
      width: { default: null },
      ratio: { default: 1 },
    },
    parseMarkdown: {
      match: ({ type }) => type === "image-block",
      runner: (state, node, type) => {
        state.addNode(type, {
          src: node.url,
          alt: node.alt ?? "",
          caption: stripImageWidth(node.title as string) ?? "",
          width: parseImageWidth(node.title as string),
        });
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === "image-block",
      runner: (state, node) => {
        state.openNode("paragraph");
        state.addNode("image", undefined, undefined, {
          url: node.attrs.src,
          alt: node.attrs.alt,
          title: formatImageTitle(node.attrs.width, node.attrs.caption) ?? null,
        });
        state.closeNode();
      },
    },
  }));
  ctx.update(editorViewOptionsCtx, (options) => ({
    ...options,
    nodeViews: {
      ...options.nodeViews,
      "image-block": (initial, view, getPos) => {
        let node = initial;
        const dom = document.createElement("div");
        dom.className = "card-editor-image";
        dom.contentEditable = "false";
        const img = document.createElement("img");
        const controls = document.createElement("div");
        controls.className = "card-editor-image-controls";
        const resize = document.createElement("input");
        resize.type = "range";
        resize.min = "48";
        resize.max = "1200";
        resize.setAttribute("aria-label", "Image width");
        const preview = document.createElement("button");
        preview.type = "button";
        preview.textContent = "Preview image";
        preview.onclick = () => onPreview(node.attrs.src);
        resize.oninput = () => {
          img.style.width = `${resize.value}px`;
        };
        resize.onchange = () => {
          const pos = getPos();
          if (pos !== undefined)
            view.dispatch(
              view.state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                width: Number(resize.value),
              }),
            );
        };
        const render = () => {
          img.src = node.attrs.src;
          img.alt = node.attrs.alt;
          img.title = node.attrs.caption;
          img.style.width = node.attrs.width ? `${node.attrs.width}px` : "";
          resize.value = String(node.attrs.width ?? 320);
        };
        render();
        controls.append(resize, preview);
        dom.append(img, controls);
        return {
          dom,
          update: (next) => {
            if (next.type !== node.type) return false;
            node = next;
            render();
            return true;
          },
          stopEvent: (event) => controls.contains(event.target as Node),
          ignoreMutation: () => true,
        };
      },
    },
  }));
}
