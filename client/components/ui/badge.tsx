import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "ui-badge--neutral border-primary bg-primary text-primary-foreground",
        secondary: "ui-badge--neutral border-secondary bg-secondary text-secondary-foreground",
        outline: "ui-badge--neutral border-border bg-transparent text-foreground",
        success: "ui-badge--success border-[#bdd2c5] bg-[#e4eee7] text-[#245744]",
        warning: "ui-badge--warning border-[#e5d3aa] bg-[#f3ead5] text-[#735824]",
        destructive: "ui-badge--danger border-[#e0bdb9] bg-[#f5e6e4] text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  tone,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    tone?: "neutral" | "success" | "warning" | "danger";
  }) {
  const resolvedVariant = tone === "success"
    ? "success"
    : tone === "warning"
      ? "warning"
      : tone === "danger"
        ? "destructive"
        : tone === "neutral"
          ? "secondary"
          : variant;

  return <span data-slot="badge" className={cn("ui-badge", badgeVariants({ variant: resolvedVariant }), className)} {...props} />;
}

export { Badge, badgeVariants };
