// The order of the window's tabs. Pure, so moving a tab and opening one place it the same way.

// The tabs with this one at `index` among the others, or at the end past them. A tab already among them moves there.
export const withTabAt = <T extends { id: string }>(tabs: ReadonlyMap<string, T>, tab: T, index: number): Map<string, T> => {
  const others = [...tabs.values()].filter(({ id }) => id !== tab.id);
  others.splice(Math.max(0, Math.min(index, others.length)), 0, tab);
  return new Map(others.map((entry) => [entry.id, entry]));
};
