import type { MouseEvent, ReactElement } from "react";
import type { Ctx } from "@milkdown/kit/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { toggleLinkCommand } from "@milkdown/kit/component/link-tooltip";
import {
  bulletListSchema,
  emphasisSchema,
  inlineCodeSchema,
  linkSchema,
  listItemSchema,
  orderedListSchema,
  strongSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { strikethroughSchema, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import type { MarkType, NodeType } from "@milkdown/kit/prose/model";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import { NodeSelection, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import {
  Bold,
  Code,
  EyeOff,
  FileCode,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Sigma,
  Strikethrough,
  Type,
  type LucideIcon,
} from "lucide-react";
import { formatBinding } from "@/lib/keybindings/keys";
import { clozeRangeAt } from "@/components/ui/markdown-cloze";
import { Tooltip } from "@/components/ui/tooltip";

// Crepe registers its equation command by name only.
const TOGGLE_MATH = "ToggleLatex";
const MATH_PLACEHOLDER = "x";

export type ActiveFormats = {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  link: boolean;
  math: boolean;
  bulletList: boolean;
  orderedList: boolean;
  cloze: boolean;
};

export const NO_FORMATS: ActiveFormats = {
  bold: false,
  italic: false,
  strike: false,
  code: false,
  link: false,
  math: false,
  bulletList: false,
  orderedList: false,
  cloze: false,
};

function hasMark(state: EditorState, type: MarkType) {
  const { from, to, empty, $from } = state.selection;
  if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));
  return state.doc.rangeHasMark(from, to, type);
}

/** The innermost list around the cursor, with its document position. */
function nearestList(state: EditorState, types: NodeType[]) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (types.includes(node.type)) return { node, pos: $from.before(depth) };
  }
  return null;
}

function inCloze(state: EditorState) {
  const range = clozeRangeAt(state, state.selection.from);
  return Boolean(range && state.selection.to <= range.to);
}

export function readFormats(ctx: Ctx, state: EditorState): ActiveFormats {
  const bullet = bulletListSchema.type(ctx);
  const ordered = orderedListSchema.type(ctx);
  const list = nearestList(state, [bullet, ordered]);
  const { selection } = state;
  return {
    bold: hasMark(state, strongSchema.type(ctx)),
    italic: hasMark(state, emphasisSchema.type(ctx)),
    strike: hasMark(state, strikethroughSchema.type(ctx)),
    code: hasMark(state, inlineCodeSchema.type(ctx)),
    link: hasMark(state, linkSchema.type(ctx)),
    math: selection instanceof NodeSelection && selection.node.type.name === "math_inline",
    bulletList: list?.node.type === bullet,
    orderedList: list?.node.type === ordered,
    // The same test as the chip popover: a cursor touching either edge of a
    // chip counts as in it.
    cloze: inCloze(state),
  };
}

export function sameFormats(a: ActiveFormats, b: ActiveFormats) {
  return (Object.keys(a) as (keyof ActiveFormats)[]).every((key) => a[key] === b[key]);
}

/** Removes the list when it already has this type, converts the other type, and wraps otherwise. */
function toggleList(ctx: Ctx, type: NodeType) {
  const view = ctx.get(editorViewCtx);
  const list = nearestList(view.state, [bulletListSchema.type(ctx), orderedListSchema.type(ctx)]);
  if (!list) {
    ctx.get(commandsCtx).call(wrapInBlockTypeCommand.key, { nodeType: type });
  } else if (list.node.type === type) {
    liftListItem(listItemSchema.type(ctx))(view.state, view.dispatch);
  } else {
    view.dispatch(view.state.tr.setNodeMarkup(list.pos, type, { spread: list.node.attrs.spread }));
  }
}

/**
 * Turns the selection into an equation. Crepe's equation popover cannot open on
 * an empty equation, so with no selection a placeholder is inserted and then
 * selected inside the popover, ready to be typed over.
 */
function toggleMath(ctx: Ctx) {
  const view = ctx.get(editorViewCtx);
  const empty = view.state.selection.empty;
  if (empty) {
    const { from } = view.state.selection;
    const tr = view.state.tr.insertText(MATH_PLACEHOLDER, from);
    view.dispatch(
      tr.setSelection(TextSelection.create(tr.doc, from, from + MATH_PLACEHOLDER.length)),
    );
  }
  ctx.get(commandsCtx).call(TOGGLE_MATH);
  if (!empty) return;
  requestAnimationFrame(() => {
    const field = view.dom.parentElement?.querySelector<HTMLElement>(
      '.milkdown-latex-inline-edit[data-show="true"] .ProseMirror',
    );
    if (!field) return;
    field.focus();
    const range = document.createRange();
    range.selectNodeContents(field);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  });
}

type Action = {
  id: keyof ActiveFormats;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  run: (ctx: Ctx) => void;
};

const GROUPS: Action[][] = [
  [
    {
      id: "bold",
      label: "Bold",
      icon: Bold,
      shortcut: "Mod+b",
      run: (ctx) => ctx.get(commandsCtx).call(toggleStrongCommand.key),
    },
    {
      id: "italic",
      label: "Italic",
      icon: Italic,
      shortcut: "Mod+i",
      run: (ctx) => ctx.get(commandsCtx).call(toggleEmphasisCommand.key),
    },
    {
      id: "strike",
      label: "Strikethrough",
      icon: Strikethrough,
      shortcut: "Mod+Alt+x",
      run: (ctx) => ctx.get(commandsCtx).call(toggleStrikethroughCommand.key),
    },
    {
      id: "code",
      label: "Code",
      icon: Code,
      shortcut: "Mod+e",
      run: (ctx) => ctx.get(commandsCtx).call(toggleInlineCodeCommand.key),
    },
  ],
  [
    {
      id: "bulletList",
      label: "Bulleted list",
      icon: List,
      shortcut: "Mod+Alt+8",
      run: (ctx) => toggleList(ctx, bulletListSchema.type(ctx)),
    },
    {
      id: "orderedList",
      label: "Numbered list",
      icon: ListOrdered,
      shortcut: "Mod+Alt+7",
      run: (ctx) => toggleList(ctx, orderedListSchema.type(ctx)),
    },
  ],
  [
    {
      id: "link",
      label: "Link",
      icon: Link,
      run: (ctx) => ctx.get(commandsCtx).call(toggleLinkCommand.key),
    },
    {
      id: "math",
      label: "Equation",
      icon: Sigma,
      run: toggleMath,
    },
  ],
];

const toolClass =
  "inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 group-focus-within/editor:aria-pressed:bg-accent-tint group-focus-within/editor:aria-pressed:text-accent-deep";

function ToolTip({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  return (
    <Tooltip
      side="top"
      delay={400}
      className="px-2 py-1"
      content={
        <span className="flex items-center gap-2">
          {label}
          {shortcut && <span className="text-muted">{formatBinding(shortcut)}</span>}
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}

// Keep the editor's selection while a tool is clicked.
const keepSelection = (event: MouseEvent) => event.preventDefault();

export function MarkdownEditorToolbar({
  onCommand,
  formats,
  source,
  disabled,
  uploading,
  onAddImage,
  onEditSource,
  onRichText,
  richTextBlocked,
  onCloze,
}: {
  onCommand: (command: (ctx: Ctx) => void) => void;
  formats: ActiveFormats;
  source: boolean;
  disabled: boolean;
  uploading: boolean;
  onAddImage: () => void;
  onEditSource: () => void;
  onRichText: () => void;
  /** Source that the rich editor would change, such as HTML or legacy equations. */
  richTextBlocked: boolean;
  /** Shows the Cloze tool first, for cloze card text. */
  onCloze?: () => void;
}) {
  const run = (action: Action) =>
    onCommand((ctx) => {
      // Focus first: Crepe's link and equation popovers only open in a focused editor.
      ctx.get(editorViewCtx).focus();
      action.run(ctx);
    });

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-1 py-0.5"
    >
      {source ? (
        <p className="mr-auto px-1 text-xs text-muted">
          {richTextBlocked ? "Kept as source to preserve its formatting" : "Markdown source"}
        </p>
      ) : (
        <>
          {onCloze && (
            <>
              <ToolTip label="Hide the selection as a cloze" shortcut="Mod+Shift+c">
                <button
                  type="button"
                  aria-pressed={formats.cloze}
                  disabled={disabled}
                  className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs font-medium text-accent-deep transition-colors duration-150 hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 group-focus-within/editor:aria-pressed:bg-accent-tint"
                  onMouseDown={keepSelection}
                  onClick={onCloze}
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                  Cloze
                </button>
              </ToolTip>
              <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />
            </>
          )}
          {GROUPS.map((group, index) => (
            <div key={index} className="flex items-center gap-0.5">
              {index > 0 && <span aria-hidden className="mx-1 h-3.5 w-px bg-border" />}
              {group.map((action) => (
                <ToolTip key={action.id} label={action.label} shortcut={action.shortcut}>
                  <button
                    type="button"
                    aria-label={action.label}
                    aria-pressed={formats[action.id]}
                    disabled={disabled}
                    className={toolClass}
                    onMouseDown={keepSelection}
                    onClick={() => run(action)}
                  >
                    <action.icon className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </ToolTip>
              ))}
            </div>
          ))}
        </>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        <ToolTip label="Add image">
          <button
            type="button"
            aria-label="Add image"
            disabled={(disabled && !source) || uploading}
            className={toolClass}
            onMouseDown={keepSelection}
            onClick={onAddImage}
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </ToolTip>
        {!source && (
          <ToolTip label="Edit the Markdown source">
            <button
              type="button"
              disabled={disabled || uploading}
              className="inline-flex h-6 cursor-pointer items-center gap-1 px-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50"
              onMouseDown={keepSelection}
              onClick={onEditSource}
            >
              <FileCode className="h-3.5 w-3.5" aria-hidden />
              Edit source
            </button>
          </ToolTip>
        )}
        {source && (
          <ToolTip
            label={
              richTextBlocked
                ? "This text uses HTML or equation formats the rich text editor would change, so it stays as source."
                : "Back to rich text"
            }
          >
            <button
              type="button"
              aria-disabled={richTextBlocked || undefined}
              disabled={uploading}
              className="inline-flex h-6 cursor-pointer items-center gap-1 px-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted"
              onClick={() => {
                if (!richTextBlocked) onRichText();
              }}
            >
              <Type className="h-3.5 w-3.5" aria-hidden />
              Rich text
            </button>
          </ToolTip>
        )}
      </div>
    </div>
  );
}
