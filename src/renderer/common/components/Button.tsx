import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-12 font-regular transition-[background-color,transform] duration-fast active:scale-[.96] disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-focus aria-invalid:border-ask [.native-page_&]:cursor-pointer select-none",
    {
        variants: {
            // DESIGN.md section 8. Three roles: filled for the one decision, outlined beside it, and quiet text for the
            // rest. Off is `faint`, on `tray` where it has a fill. Destructive is only the recording's Stop, where red is
            // the status itself.
            variant: {
                default: "bg-ink text-ground font-medium hover:bg-ink/85 disabled:bg-tray disabled:text-faint",
                outline: "shadow-[inset_0_0_0_1px_var(--line)] text-ink-2 hover:bg-hover hover:text-ink active:bg-press disabled:text-faint",
                ghost: "text-ink-2 hover:bg-hover hover:text-ink active:bg-press disabled:text-faint",
                destructive:
                    "bg-ask text-ground hover:brightness-95 active:brightness-90",
            },
            size: {
                default: "h-[30px] gap-1.5 px-3 has-[>svg]:px-2.5",
                xs: "h-6 gap-1.5 px-2.5 has-[>svg]:px-2",
                sm: "h-[26px] gap-1.5 px-2.5 has-[>svg]:px-2",
                lg: "h-9 px-4 has-[>svg]:px-3",
                icon: "size-8",
                "icon-xs": "size-6",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

const Button = React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
        asChild?: boolean;
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
        <Comp
            ref={ref}
            data-slot="button"
                        className={cn(buttonVariants({ variant, size, className }))}
            {...props}
        />
    );
});
Button.displayName = "Button";

export { Button, buttonVariants };
