import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@common/lib/utils";

interface ToolBarButtonProps {
    Icon?: LucideIcon;
    label: string;
    active?: boolean;
    toggled?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
    className?: string;
}

export const ToolBarButton: React.FC<ToolBarButtonProps> = ({
    Icon,
    label,
    active = true,
    toggled = false,
    onClick,
    children,
    className,
}) => {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={toggled || undefined}
            disabled={!active}
            className={cn(
                "size-8 flex shrink-0 items-center justify-center rounded-row",
                "text-ink-3 hover:text-ink app-region-no-drag outline-none transition-[background-color,color,transform] duration-fast",
                "focus-visible:ring-2 focus-visible:ring-focus",
                "hover:bg-hover active:bg-press active:scale-[.96] disabled:text-faint disabled:hover:bg-transparent disabled:active:scale-100",
                toggled && "bg-press text-ink",
                className
            )}
            onClick={onClick}
        >
            {children || (Icon && <Icon className="size-4" strokeWidth={1.75} />)}
        </button>
    );
};
