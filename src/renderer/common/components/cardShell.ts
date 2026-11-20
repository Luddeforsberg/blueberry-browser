// DESIGN.md section 3: anything you type into or have to answer is a card set into a tray-coloured shell, 4px larger all
// round, with the shell's radius 4px more than the card's. The prompt box, an approval and making a mascot share these.
export const SHELL = "bg-tray p-1 shadow-[inset_0_0_0_1px_var(--line)]";

// The prompt box at full size, and anything else that size: a 24px card in a 28px shell.
export const BIG_SHELL = `${SHELL} rounded-shell`;
export const BIG_CARD = "rounded-prompt shadow-card-lift";
