import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../lib/utils";
import { buttonVariants } from "./buttonVariants";

// No `title`: the chrome doesn't use the system's tooltip. Wrap the button in `Tooltip` instead (DESIGN.md section 8).
const Button = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<"button">, "title"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return <Comp ref={ref} data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = "Button";

export { Button };
