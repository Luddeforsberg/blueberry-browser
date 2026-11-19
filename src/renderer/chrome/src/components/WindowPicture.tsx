import React from "react";
import { cn } from "@common/lib/utils";

// A small drawing of the window, 86 by 56, for Settings' Theme and Tabs. `mode` draws it light or dark whatever the
// window is, and System is half of each. Without one, it's in the window's own colours. A hairline goes round it, as a
// light window is nearly the colour of the sheet it's drawn on.

const Window: React.FC<{ tabs: "side" | "top"; className?: string | undefined }> = ({ tabs, className }) =>
  tabs === "side" ? (
    <span
      className={cn("absolute inset-0 flex py-[5px] pr-[5px] bg-ground rounded-[inherit] shadow-[inset_0_0_0_1px_var(--line)]", className)}
    >
      <span className="w-6 shrink-0 flex flex-col gap-[3px] pt-[5px] pl-1.5 pr-[5px]">
        <i className="h-[3px] w-[70%] rounded-[2px] bg-dot" />
        <i className="h-[3px] rounded-[2px] bg-dot" />
        <i className="h-[3px] rounded-[2px] bg-dot" />
        <i className="h-[3px] rounded-[2px] bg-dot" />
      </span>
      <span className="flex-1 rounded-[5px] bg-sheet shadow-[0_0_0_1px_var(--dot)]" />
    </span>
  ) : (
    <span
      className={cn(
        "absolute inset-0 flex flex-col px-[5px] pb-[5px] bg-ground rounded-[inherit] shadow-[inset_0_0_0_1px_var(--line)]",
        className,
      )}
    >
      <span className="h-[13px] shrink-0 flex items-center gap-[3px] pl-px">
        <i className="w-[15px] h-1.5 rounded-[2px] bg-sheet shadow-[0_0_0_1px_var(--dot)]" />
        <i className="w-[15px] h-1 rounded-[2px] bg-dot" />
        <i className="w-[15px] h-1 rounded-[2px] bg-dot" />
      </span>
      <span className="flex-1 rounded-[5px] bg-sheet shadow-[0_0_0_1px_var(--dot)]" />
    </span>
  );

export const WindowPicture: React.FC<{ mode?: "light" | "dark" | "system"; tabs?: "side" | "top" }> = ({ mode, tabs = "side" }) => {
  if (mode === "system") {
    return (
      <>
        <Window tabs={tabs} className="light" />
        <Window tabs={tabs} className="dark [clip-path:polygon(50%_0,100%_0,100%_100%,50%_100%)]" />
      </>
    );
  }
  return <Window tabs={tabs} className={mode} />;
};
