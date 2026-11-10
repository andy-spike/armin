import type { ClassValue } from "clsx";
import { cn } from "./cn";

type VariantMap = Record<string, Record<string, string>>;
type Selection<V extends VariantMap> = { [K in keyof V]?: keyof V[K] };

interface Config<V extends VariantMap> {
  base?: string;
  variants: V;
  defaults: { [K in keyof V]: keyof V[K] };
  compound?: Array<Selection<V> & { class: string }>;
}

export function variants<V extends VariantMap>(config: Config<V>) {
  return (selection: Selection<V> = {}, className?: ClassValue): string => {
    const picked = { ...config.defaults, ...stripUndefined(selection) } as Record<keyof V, string>;
    const classes = Object.keys(config.variants).map((key) => {
      const table = config.variants[key];
      return table[picked[key]] ?? table[config.defaults[key] as string];
    });
    const compound = (config.compound ?? [])
      .filter((entry) =>
        Object.entries(entry).every(
          ([key, value]) => key === "class" || picked[key as keyof V] === value,
        ),
      )
      .map((entry) => entry.class);
    return cn(config.base, classes, compound, className);
  };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
