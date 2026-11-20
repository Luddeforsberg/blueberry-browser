import React from "react";
import { Button } from "@common/components/Button";
import { useForAMoment } from "@common/lib/timers";

const SAID_FOR_MS = 1500;

export const CopyLink: React.FC<{ link: string; label?: string; main?: boolean }> = ({ link, label, main = false }) => {
  const [copied, sayCopied] = useForAMoment(SAID_FOR_MS);
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    sayCopied();
  };
  return (
    <Button variant={main ? "default" : "raised"} size="sm" aria-label={label} onClick={() => void copy()}>
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
};
