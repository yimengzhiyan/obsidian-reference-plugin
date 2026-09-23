export type NavigationResult =
  | "highlighted-exact"
  | "highlighted-block"
  | "missing-target"
  | "missing-block"
  | "unsupported-view";

export function classifyHighlightResult(
  locationKind: "exact" | "block-only",
  appliedKind: "exact" | "block" | null,
): NavigationResult {
  if (appliedKind === null) return "unsupported-view";
  return locationKind === "exact" && appliedKind === "exact"
    ? "highlighted-exact"
    : "highlighted-block";
}
