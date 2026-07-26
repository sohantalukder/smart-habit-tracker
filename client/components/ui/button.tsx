import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "ui-button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
  {
    variants: {
      variant: {
        default: "ui-button--primary border border-primary bg-primary text-primary-foreground hover:bg-primary/92",
        destructive: "ui-button--danger border border-destructive bg-destructive text-white hover:bg-destructive/90",
        danger: "ui-button--danger border border-destructive bg-destructive text-white hover:bg-destructive/90",
        outline: "border border-border bg-card hover:bg-secondary",
        secondary: "ui-button--secondary border border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/75",
        ghost: "ui-button--ghost border border-transparent hover:bg-secondary hover:text-secondary-foreground",
        link: "h-auto border-0 p-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-6 text-base",
        icon: "size-10",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
