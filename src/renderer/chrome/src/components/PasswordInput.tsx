import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@common/lib/utils";
import { IconSwap } from "@common/components/IconSwap";
import { Tooltip } from "@common/components/Tooltip";

// A password field with an eye at its end to show what's typed, in the first run and in Settings. `className` is the
// field's own look, which differs between a card and a sheet.
export const PasswordInput: React.FC<{ value: string; onChange: (value: string) => void; isNew: boolean; className: string }> = ({
  value,
  onChange,
  isNew,
  className,
}) => {
  const [shown, setShown] = useState(false);
  const label = shown ? "Hide the password" : "Show the password";
  return (
    <span className="relative block">
      <input
        type={shown ? "text" : "password"}
        autoComplete={isNew ? "new-password" : "current-password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(className, "pr-10")}
      />
      {/* Centred by its own box rather than a transform, so the press can scale it. */}
      <span className="absolute right-1.5 inset-y-0 flex items-center">
        <Tooltip words={label}>
          <button
            type="button"
            aria-label={label}
            onClick={() => setShown(!shown)}
            className="press size-7 grid place-items-center rounded-row text-ink-3 hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <IconSwap
              shown={shown ? "shown" : "hidden"}
              icons={{ hidden: <Eye className="size-4" strokeWidth={1.75} />, shown: <EyeOff className="size-4" strokeWidth={1.75} /> }}
            />
          </button>
        </Tooltip>
      </span>
    </span>
  );
};
