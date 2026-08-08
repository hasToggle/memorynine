import { cn } from "@repo/design-system/lib/utils";
import NextLink from "next/link";

const variants = {
  brand: cn(
    "inline-flex items-center justify-center overflow-hidden",
    "rounded-md border border-transparent bg-white px-4 py-2 font-semibold text-base",
    "text-ht-blue-700 tracking-tight shadow-[0_0_0.2em_0em_rgba(56,189,248,0.2)] ring-1 ring-black/10",
    "hover:text-ht-blue-800 hover:shadow-[0_0_0.5em_0em_rgba(56,189,248,0.4)]",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
    "active:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70"
  ),
  outline: cn(
    "inline-flex items-center justify-center px-2 py-[calc(0.375rem-1px)]",
    "rounded-lg border border-transparent shadow ring-1 ring-border",
    "whitespace-nowrap font-medium text-foreground text-sm",
    "hover:bg-muted disabled:bg-transparent disabled:opacity-40"
  ),
  primary: cn(
    "inline-flex items-center justify-center px-4 py-[calc(0.5rem-1px)]",
    "rounded-full border border-transparent bg-primary shadow-md",
    "whitespace-nowrap font-medium text-base text-primary-foreground",
    "hover:bg-primary/90 disabled:opacity-40"
  ),
  secondary: cn(
    "relative inline-flex items-center justify-center px-4 py-[calc(0.5rem-1px)]",
    "rounded-full border border-transparent bg-white/90 shadow-md ring-1 ring-[#29a8fe]/15",
    "after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_0_2px_1px_#ffffff4d]",
    "whitespace-nowrap font-medium text-base text-slate-950",
    "hover:bg-white disabled:bg-white/70 disabled:opacity-50"
  ),
};

type MarketingButtonProps = {
  variant?: keyof typeof variants;
  className?: string;
  href?: string;
} & (
  | React.ComponentPropsWithoutRef<"a">
  | React.ComponentPropsWithoutRef<"button">
);

export function MarketingButton({
  variant = "primary",
  className,
  href,
  ...props
}: MarketingButtonProps) {
  const combinedClassName = cn(className, variants[variant]);

  if (href) {
    return (
      <NextLink
        className={combinedClassName}
        href={href}
        {...(props as React.ComponentPropsWithoutRef<"a">)}
      />
    );
  }

  return (
    <button
      className={combinedClassName}
      type="button"
      {...(props as React.ComponentPropsWithoutRef<"button">)}
    />
  );
}
