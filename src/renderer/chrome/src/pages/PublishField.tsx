import React from "react";

// Part of publishing a mascot (PublishMascot.tsx): a field of the form.

export const INPUT = "w-full px-3 rounded-tile border bg-sheet text-14 outline-none focus-visible:ring-2 focus-visible:ring-focus";
export const ROW = "py-5 border-b";

export const Field: React.FC<{ title: string; hint?: string; htmlFor?: string; children: React.ReactNode }> = ({
  title,
  hint,
  htmlFor,
  children,
}) => (
  <div className={ROW}>
    {htmlFor ? (
      <label htmlFor={htmlFor} className="block text-14 font-medium">
        {title}
      </label>
    ) : (
      <p className="text-14 font-medium">{title}</p>
    )}
    {hint && <p className="mt-0.5 text-14 text-ink-2">{hint}</p>}
    <div className="mt-2">{children}</div>
  </div>
);
