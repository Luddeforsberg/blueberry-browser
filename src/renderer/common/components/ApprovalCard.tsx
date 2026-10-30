import React from "react";
import { Button } from "./Button";

// What Berry shows before anything that matters. It says exactly what will happen, in plain words.
export interface ApprovalRequest {
  question: string;
  details: string;
  confirmLabel: string;
  reviewLabel?: string;
}

export const ApprovalCard: React.FC<{
  request: ApprovalRequest;
  onConfirm: () => void;
  onReview?: () => void;
  onCancel: () => void;
}> = ({ request, onConfirm, onReview, onCancel }) => (
  <section aria-label="Approval needed" className="rounded-panel border bg-surface p-3 shadow-float">
    <h3 className="text-13 font-semibold">{request.question}</h3>
    <p className="mt-1 text-12 text-muted-foreground">{request.details}</p>
    <div className="mt-3 flex items-center gap-3">
      <Button size="sm" onClick={onConfirm}>
        {request.confirmLabel}
      </Button>
      {request.reviewLabel && onReview && (
        <Button size="sm" variant="link" className="px-0 underline" onClick={onReview}>
          {request.reviewLabel}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </section>
);
