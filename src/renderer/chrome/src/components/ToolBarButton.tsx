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
                "text-ink-2 hover:text-ink app-region-no-drag outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-focus",
                "hover:bg-hover active:bg-press disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-2",
                toggled && "bg-sheet-2 text-ink",
                className
            )}
            onClick={onClick}
        >
            {children || (Icon && <Icon className="size-4" />)}
        </button>
    );
};
