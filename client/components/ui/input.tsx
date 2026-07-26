import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "ui-input flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base text-foreground shadow-none outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
