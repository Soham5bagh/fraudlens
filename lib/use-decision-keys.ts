"use client";

import { useEffect } from "react";
import type { Action } from "./types";

const MAP: Record<string, Action> = {
  a: "approve",
  h: "hold",
  e: "escalate",
  b: "block",
};

export function useDecisionKeys(enabled: boolean, onAction: (action: Action) => void, onRecord: () => void) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "r") {
        event.preventDefault();
        onRecord();
        return;
      }
      const action = MAP[key];
      if (!action) return;
      event.preventDefault();
      onAction(action);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onAction, onRecord]);
}
