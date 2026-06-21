"use client";

import { Check, Loader2, Circle } from "lucide-react";

export type StepState = "pending" | "active" | "done";

export interface Step {
  key: string;
  label: string;
  detail?: string;
  state: StepState;
}

interface Props {
  title: string;
  steps: Step[];
}

export function StepTimeline({ title, steps }: Props) {
  return (
    <div className="flex flex-col gap-2 border border-base-300 rounded-sm bg-base-200/40 p-3">
      <span className="text-xs uppercase tracking-wider text-base-content/60">
        {title}
      </span>
      <ol className="flex flex-col gap-1">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={`flex items-start gap-2 text-sm ${
              s.state === "active"
                ? "text-base-content"
                : s.state === "done"
                  ? "text-base-content/70"
                  : "text-base-content/40"
            }`}
          >
            <span className="mt-0.5">
              {s.state === "done" ? (
                <Check className="w-3.5 h-3.5 text-success" />
              ) : s.state === "active" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-warning" />
              ) : (
                <Circle className="w-3.5 h-3.5" />
              )}
            </span>
            <span>
              <span className="font-mono text-xs text-base-content/40 mr-1">
                {i + 1}.
              </span>
              {s.label}
              {s.detail && (
                <span className="block text-xs text-base-content/40">
                  {s.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
