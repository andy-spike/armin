import type { ReactNode } from "react";
import { ArrowUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SortOption<T extends string> = {
  value: T;
  label: string;
};

type SortControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SortOption<T>[];
  className?: string;
  layout?: "beside" | "field" | "inline";
  label?: ReactNode;
  triggerClassName?: string;
};

export function SortControl<T extends string>({
  value,
  onChange,
  options,
  className,
  layout = "beside",
  label = "Sort",
  triggerClassName,
}: SortControlProps<T>) {
  const items = options.map((opt) => ({ value: opt.value, label: opt.label }));

  const select = (
    <Select value={value} items={items} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger
        className={cn("w-full min-w-[11rem] border-border-strong bg-surface", triggerClassName)}
        aria-label="Sort by"
      >
        {layout === "inline" && <ArrowUpDown className="size-3.5 text-muted" aria-hidden />}
        <SelectValue className="flex-1 text-left" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  if (layout === "field") {
    return (
      <label className={cn("flex flex-col gap-1.5", className)}>
        <span className="inline-flex h-3.5 items-center gap-1.5 text-xs font-medium text-muted">
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {label}
        </span>
        {select}
      </label>
    );
  }

  if (layout === "inline") return <div className={className}>{select}</div>;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      {select}
    </div>
  );
}
