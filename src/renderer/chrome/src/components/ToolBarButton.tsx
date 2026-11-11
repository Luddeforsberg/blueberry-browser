import React, { createContext, useContext } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@common/lib/utils";

// The top bar over the new tab's valley, where its icons are white on the scrim.
export const OverScene = createContext(false);

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
    const scene = useContext(OverScene);
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={toggled || undefined}
            disabled={!active}
            className={cn(
                "size-8 flex shrink-0 items-center justify-center rounded-full app-region-no-drag outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:hover:bg-transparent",
                scene
                    ? "text-scene-ink hover:bg-scene-ink/15 active:bg-scene-ink/25 focus-visible:ring-scene-ink"
                    : cn(
                          "text-muted-foreground hover:text-foreground hover:bg-hover active:bg-pressed disabled:hover:text-muted-foreground",
                          toggled && "bg-pressed text-foreground hover:bg-pressed"
                      ),
                scene && toggled && "bg-scene-ink/25",
                className
            )}
            onClick={onClick}
        >
            {children || (Icon && <Icon className="size-4" />)}
        </button>
    );
};
