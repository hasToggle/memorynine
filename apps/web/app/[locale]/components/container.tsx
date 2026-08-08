import { cn } from "@repo/design-system/lib/utils";

const widths = {
  narrow: "max-w-3xl",
  wide: "max-w-6xl",
};

export function Container({
  className,
  width = "wide",
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { width?: keyof typeof widths }) {
  return (
    <div
      className={cn("mx-auto px-6 sm:px-8", widths[width], className)}
      {...props}
    />
  );
}

export function Eyebrow({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn(
        "font-medium font-mono text-[0.6875rem] text-mn-graphite uppercase tracking-[0.22em]",
        className
      )}
      {...props}
    />
  );
}

export function SectionHeading({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"h2">) {
  return (
    <h2
      className={cn(
        "font-cabinet font-extrabold text-[2rem] leading-[1.05] tracking-[-0.035em] sm:text-[2.75rem]",
        className
      )}
      {...props}
    />
  );
}
