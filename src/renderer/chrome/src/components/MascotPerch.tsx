import React from "react";
import { Plus } from "lucide-react";
import { cn } from "@common/lib/utils";
import { useMascots } from "../contexts/useLibrary";
import { BERRY_ID } from "@shared/mascots";
import { Berry } from "./Berry";
import { useAssistantName } from "./useAssistantName";
import { startMascot } from "../mascotsView";

// Your mascots in a row, to choose who runs a routine. In the flow rather than floating, so it fits in the form.
export const MascotPerch: React.FC<{ selectedId: string; onChoose: (id: string) => void; onClose?: () => void }> = ({
  selectedId,
  onChoose,
  onClose,
}) => {
  const { mascots, find } = useMascots();
  const berryName = useAssistantName();
  // A routine can still belong to a mascot that's been deleted, and shows it until it's moved.
  const shown = mascots.some((mascot) => mascot.id === selectedId) ? mascots : [...mascots, find(selectedId)];

  return (
    <ul
      aria-label="Your mascots"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose?.();
      }}
      className="flex flex-wrap gap-1"
    >
      {shown.map((mascot) => (
        <li key={mascot.id}>
          <button
            type="button"
            aria-pressed={mascot.id === selectedId}
            onClick={() => onChoose(mascot.id)}
            className={cn(
              "w-[72px] py-1.5 flex flex-col items-center gap-0.5 rounded-tile outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
              mascot.id === selectedId ? "bg-sheet-2" : "hover:bg-hover",
            )}
          >
            <Berry size={40} mascot={mascot} />
            <span className="w-full px-1 truncate text-center text-13">
              {mascot.id === BERRY_ID ? berryName : mascot.name}
              {mascot.deletedAt !== null && " (deleted)"}
            </span>
          </button>
        </li>
      ))}
      {onClose && (
        <li>
          <button
            type="button"
            onClick={() => {
              startMascot();
              onClose();
            }}
            className="w-[72px] py-1.5 flex flex-col items-center gap-0.5 rounded-tile text-ink-2 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="size-10 flex items-center justify-center">
              <Plus className="size-5" strokeWidth={1.75} />
            </span>
            <span className="text-13">New</span>
          </button>
        </li>
      )}
    </ul>
  );
};
