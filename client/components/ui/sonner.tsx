"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    position="bottom-right"
    toastOptions={{
      classNames: {
        toast: "!rounded-md !border-border !bg-card !text-card-foreground !shadow-lg",
        title: "!font-semibold",
        description: "!text-muted-foreground",
        actionButton: "!bg-primary !text-primary-foreground",
      },
    }}
    {...props}
  />
);

export { Toaster };
