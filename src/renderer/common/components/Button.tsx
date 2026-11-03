import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-14 font-regular disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive [.native-page_&]:cursor-pointer select-none",
    {
        variants: {
            // Three roles: primary for the one decision, outline beside it, and quiet text for the rest.
            // Destructive is only the recording's Stop, where red is the status itself.
            variant: {
                default: "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/40 disabled:opacity-100",
                outline: "border bg-surface text-foreground hover:bg-muted active:brightness-95",
                ghost: "hover:bg-muted active:brightness-95",
                destructive:
                    "bg-destructive text-destructive-foreground hover:brightness-95 active:brightness-90",
            },
            size: {
                default: "h-9 px-4 py-2 has-[>svg]:px-3",
                xs: "h-7 gap-1.5 px-2.5 has-[>svg]:px-2",
                sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
                lg: "h-10 px-6 has-[>svg]:px-4",
                icon: "size-9",
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
