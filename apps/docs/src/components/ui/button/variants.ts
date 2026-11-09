import { variants } from "@/lib/variants";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "secondary-destructive"
  | "outline";
export type ButtonSize = "xs" | "sm" | "base" | "lg";
export type ButtonShape = "base" | "square" | "circle";

export const buttonBase =
  "group inline-flex max-w-full shrink-0 items-center justify-center rounded-lg text-center font-medium no-underline [text-wrap:balance] transition-all cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow",
  secondary:
    "bg-card text-foreground ring ring-border shadow-sm hover:bg-accent hover:ring-border-strong",
  ghost: "bg-transparent text-foreground shadow-none hover:bg-accent",
  destructive: "bg-danger text-white shadow-sm hover:bg-danger/90",
  "secondary-destructive":
    "bg-card text-danger ring ring-border shadow-sm hover:bg-accent hover:ring-danger/40",
  outline: "bg-transparent text-foreground ring ring-border hover:ring-border-strong",
};

export const buttonSizeText: Record<ButtonSize, string> = {
  xs: "gap-1 px-2 py-1 text-xs",
  sm: "gap-1 px-3 py-1.5 text-xs",
  base: "gap-1.5 px-4 py-2 text-sm",
  lg: "gap-2 px-5 py-2.5 text-sm",
};

export const buttonSizeCompact: Record<ButtonSize, string> = {
  xs: "size-7",
  sm: "size-8",
  base: "size-9",
  lg: "size-10",
};

export const buttonIconSize: Record<ButtonSize, string> = {
  xs: "h-3.5 w-3.5",
  sm: "h-3.5 w-3.5",
  base: "h-4 w-4",
  lg: "h-[1.125rem] w-[1.125rem]",
};

export interface ButtonVariantsOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
}

const button = variants({
  base: buttonBase,
  variants: {
    variant: buttonVariantClasses,
    size: buttonSizeText,
    shape: { base: "", square: "p-0", circle: "p-0 rounded-full" },
  },
  defaults: { variant: "secondary", size: "base", shape: "base" },
  compound: (["square", "circle"] as const).flatMap((shape) =>
    (Object.keys(buttonSizeCompact) as ButtonSize[]).map((size) => ({
      shape,
      size,
      class: buttonSizeCompact[size],
    })),
  ),
});

export function buttonVariants(options: ButtonVariantsOptions = {}): string {
  return button(options);
}
