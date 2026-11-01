import React from "react";
import { cn } from "../lib/utils";
import { Button } from "./Button";

// A mascot saying something that needs an answer, in line with the conversation. In the main chat its bird hangs beside
// the column, as it does on a reply. With no room there, it takes the start of the line.
export const MascotSays: React.FC<{
  label: string;
  avatar: React.ReactNode;
  avatarOutside?: boolean;
  title: React.ReactNode;
  note: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, avatar, avatarOutside = false, title, note, children }) => (
  <section aria-label={label} className={cn("relative [overflow-wrap:anywhere] animate-fade-in", !avatarOutside && "flex items-start gap-3")}>
    <div className={cn("shrink-0", avatarOutside && "absolute -left-11 top-0")}>{avatar}</div>
    <div className="min-w-0 flex-1">
      <h3 className="text-16">{title}</h3>
      <p className="mt-1 text-12 text-muted-foreground whitespace-pre-wrap">{note}</p>
      <div className="mt-3">{children}</div>
    </div>
  </section>
);

// What a mascot asks before anything that matters: what it would like to do, then exactly what will happen.
export const ApprovalCard: React.FC<{
  avatar: React.ReactNode;
  avatarOutside?: boolean;
  question: React.ReactNode;
  exactly: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ avatar, avatarOutside, question, exactly, onConfirm, onCancel }) => (
  <MascotSays label="Approval needed" avatar={avatar} avatarOutside={avatarOutside} title={question} note={exactly}>
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={onConfirm}>
        Allow
      </Button>
      <Button size="sm" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </MascotSays>
);
