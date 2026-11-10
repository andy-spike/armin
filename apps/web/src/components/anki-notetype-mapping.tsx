import type { CustomNotetypeSummary, NotetypeMapping } from "@armin/core/anki";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TruncatedLabel } from "@/components/ui/truncated-label";

type Kind = NotetypeMapping["kind"];
type Side = "front" | "back" | "skip";

const KIND_ITEMS: { value: Kind; label: string }[] = [
  { value: "template", label: "Keep Anki's card layout" },
  { value: "basic", label: "Basic" },
  { value: "basic_reversed", label: "Basic and reversed" },
  { value: "type_answer", label: "Type the answer" },
];

const plural = (value: number, noun: string) =>
  `${value.toLocaleString()} ${noun}${value === 1 ? "" : "s"}`;

/** Which side each field is on, read back from a mapping. */
function sidesOf(mapping: NotetypeMapping, fieldCount: number): Side[] {
  return Array.from({ length: fieldCount }, (_, index) => {
    if (mapping.kind === "template") return "skip";
    if (mapping.front.includes(index)) return "front";
    if (mapping.kind === "type_answer") return mapping.answer === index ? "back" : "skip";
    return mapping.back.includes(index) ? "back" : "skip";
  });
}

function mappingFrom(kind: Kind, sides: Side[]): NotetypeMapping {
  const at = (side: Side) => sides.flatMap((value, index) => (value === side ? [index] : []));
  if (kind === "template") return { kind };
  if (kind === "type_answer") return { kind, front: at("front"), answer: at("back")[0] ?? -1 };
  return { kind, front: at("front"), back: at("back") };
}

/** A first guess for a new mapping: the first field asks, the second answers. */
function defaultSides(fieldCount: number): Side[] {
  return Array.from({ length: fieldCount }, (_, index) =>
    index === 0 ? "front" : index === 1 ? "back" : "skip",
  );
}

/** Whether a mapping can produce cards; the preview disables Import until it can. */
export function mappingComplete(mapping: NotetypeMapping | undefined) {
  if (!mapping || mapping.kind === "template") return true;
  if (mapping.front.length === 0) return false;
  return mapping.kind === "type_answer" ? mapping.answer >= 0 : mapping.back.length > 0;
}

/**
 * Note types Armin doesn't recognize. By default each Anki card's template is
 * rendered into a basic card; here the user can instead say which fields go on
 * each side of one Armin card type, which keeps the content clean.
 */
export function NotetypeMappingSection({
  notetypes,
  mappings,
  onChange,
}: {
  notetypes: CustomNotetypeSummary[];
  mappings: Record<string, NotetypeMapping>;
  onChange: (notetypeId: string, mapping: NotetypeMapping) => void;
}) {
  if (notetypes.length === 0) return null;
  return (
    <section aria-labelledby="anki-notetypes" className="mt-6 space-y-2">
      <div>
        <h3 id="anki-notetypes" className="font-sans text-[0.8125rem] font-medium text-ink">
          Custom note types
        </h3>
        <p className="mt-0.5 text-[0.8125rem] text-muted">
          Armin doesn&apos;t know these note types. Each card keeps its Anki layout, or you can
          choose which fields go on each side.
        </p>
      </div>
      <ul className="space-y-2">
        {notetypes.map((notetype) => (
          <NotetypeRow
            key={notetype.id}
            notetype={notetype}
            mapping={mappings[notetype.id] ?? { kind: "template" }}
            onChange={(mapping) => onChange(notetype.id, mapping)}
          />
        ))}
      </ul>
    </section>
  );
}

function NotetypeRow({
  notetype,
  mapping,
  onChange,
}: {
  notetype: CustomNotetypeSummary;
  mapping: NotetypeMapping;
  onChange: (mapping: NotetypeMapping) => void;
}) {
  const fieldCount = notetype.fields.length;
  const sides = sidesOf(mapping, fieldCount);
  const answerLabel = mapping.kind === "type_answer" ? "Answer" : "Back";

  const setKind = (kind: Kind) => {
    if (kind === mapping.kind) return;
    const current = mapping.kind === "template" ? defaultSides(fieldCount) : sides;
    // Type the answer takes one answer field: keep the first back field.
    const firstBack = current.indexOf("back");
    const next =
      kind === "type_answer"
        ? current.map((side, index) => (side === "back" && index !== firstBack ? "skip" : side))
        : current;
    onChange(mappingFrom(kind, next));
  };

  const setSide = (index: number, side: Side) => {
    const next = sides.map((value, i) => {
      if (i === index) return side;
      // Only one field can be the typed answer.
      if (mapping.kind === "type_answer" && side === "back" && value === "back") return "skip";
      return value;
    });
    onChange(mappingFrom(mapping.kind, next));
  };

  return (
    <li className="border border-border">
      <div className="flex flex-wrap items-center gap-3 bg-bg-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <TruncatedLabel label={notetype.name} className="text-sm font-medium text-ink" />
          <p className="text-xs text-muted">{plural(notetype.noteCount, "note")}</p>
        </div>
        <Select
          value={mapping.kind}
          items={KIND_ITEMS}
          onValueChange={(value) => setKind(value as Kind)}
        >
          <SelectTrigger size="sm" aria-label={`Card type for ${notetype.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {KIND_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {mapping.kind !== "template" && (
        <>
          <ul className="divide-y divide-border border-t border-border">
            {notetype.fields.map((field, index) => (
              <li key={`${field}-${index}`} className="flex items-center gap-3 px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <TruncatedLabel label={field} className="text-[0.8125rem] text-ink" />
                  {notetype.sample[index] && (
                    <TruncatedLabel label={notetype.sample[index]} className="text-xs text-muted" />
                  )}
                </div>
                <Segmented<Side>
                  size="sm"
                  aria-label={`Side for ${field}`}
                  value={sides[index]}
                  onChange={(side) => setSide(index, side)}
                  options={[
                    { value: "front", label: "Front" },
                    { value: "back", label: answerLabel },
                    { value: "skip", label: "Skip" },
                  ]}
                />
              </li>
            ))}
          </ul>
          {!mappingComplete(mapping) && (
            <p className="border-t border-border px-3 py-1.5 text-xs text-again">
              {mapping.kind === "type_answer"
                ? "Choose at least one front field and the answer field."
                : "Choose at least one field for each side."}
            </p>
          )}
        </>
      )}
    </li>
  );
}
