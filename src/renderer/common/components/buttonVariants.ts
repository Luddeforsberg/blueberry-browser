import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-14 font-medium transition-[background-color,transform] duration-fast active:scale-[.96] disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-focus aria-invalid:border-ask [.native-page_&]:cursor-pointer select-none",
  {
    variants: {
      // DESIGN.md section 8. Three roles: filled for the one decision, raised beside it, and quiet text for the
      // rest. Off is `faint`, on `tray` where it has a fill. Raised takes `hover` over its own sheet, and in dark
      // the sheet a step up, so it still stands off the sheet it's on.
      variant: {
        default: "bg-ink text-ground shadow-filled hover:bg-ink/85 disabled:bg-tray disabled:text-faint disabled:shadow-none",
        raised:
          "bg-sheet dark:bg-sheet-2 text-ink shadow-chip hover:[background-image:linear-gradient(var(--hover),var(--hover))] active:[background-image:linear-gradient(var(--press),var(--press))] disabled:bg-tray disabled:text-faint disabled:shadow-none",
        ghost: "text-ink-2 hover:bg-hover hover:text-ink active:bg-press disabled:text-faint",
        // The one decision when it can't be undone, in Asking first.
        danger: "bg-ask text-ground shadow-filled hover:bg-ask/85 disabled:bg-tray disabled:text-faint disabled:shadow-none",
      },
      // 32px, or 28px where the button belongs to a row.
      size: {
        default: "h-8 gap-1.5 px-[13px] has-[>svg]:px-3",
        xs: "h-6 gap-1.5 px-2.5 has-[>svg]:px-2",
        sm: "h-7 gap-1.5 px-[11px] has-[>svg]:px-2.5",
        lg: "h-9 px-4 has-[>svg]:px-3",
        icon: "size-8",
        "icon-xs": "size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
