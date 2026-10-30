import React from "react";
import { Moon, Sun } from "lucide-react";
import { ToolBarButton } from "./ToolBarButton";
import { useShell } from "../contexts/ShellContext";

export const DarkModeToggle: React.FC = () => {
    const { theme, toggleDark } = useShell();

    return (
        <ToolBarButton
            Icon={theme.isDark ? Sun : Moon}
            label={theme.isDark ? "Use light appearance" : "Use dark appearance"}
            onClick={toggleDark}
        />
    );
};
