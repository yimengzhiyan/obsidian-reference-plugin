export type SelectionViewSource = "active" | "retained";

export type SelectionContextResult =
  | { kind: "ready"; source: SelectionViewSource }
  | { kind: "missing-pending" }
  | { kind: "missing-expected-target" }
  | { kind: "no-markdown-view" }
  | { kind: "wrong-active-target"; actualPath: string };

export function resolveSelectionContext(
  hasPending: boolean,
  expectedPath: string | null,
  activePath: string | null,
  retainedPath: string | null,
): SelectionContextResult {
  if (!hasPending) return { kind: "missing-pending" };
  if (!expectedPath) return { kind: "missing-expected-target" };
  if (retainedPath === expectedPath) return { kind: "ready", source: "retained" };
  if (activePath === expectedPath) return { kind: "ready", source: "active" };
  if (activePath === null) return { kind: "no-markdown-view" };
  return { kind: "wrong-active-target", actualPath: activePath };
}
