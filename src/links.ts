export const SMART_REF_ATTRIBUTE = "data-smart-ref-id";

export interface SmartReferenceLink {
  from: number;
  to: number;
  linktext: string;
  target: string;
  alias: string | null;
  refId: string;
}

interface WikiLink extends Omit<SmartReferenceLink, "refId"> {
  refId: string | null;
}

const WIKI_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;
const REF_MARKER_PATTERN = /^[ \t]*%%ref:([A-Za-z0-9_-]+)%%/;

export function parseSmartReferenceLinks(source: string): SmartReferenceLink[] {
  return parseWikiLinks(source).filter((link): link is SmartReferenceLink => link.refId !== null);
}

function parseWikiLinks(source: string): WikiLink[] {
  const links: WikiLink[] = [];
  for (const match of source.matchAll(WIKI_LINK_PATTERN)) {
    if (match.index === undefined) continue;
    const linktext = match[1];
    const aliasSeparator = findUnescapedAliasSeparator(linktext);
    const target = aliasSeparator === -1 ? linktext : linktext.slice(0, aliasSeparator);
    const alias = aliasSeparator === -1 ? null : linktext.slice(aliasSeparator + 1);
    const marker = REF_MARKER_PATTERN.exec(source.slice(match.index + match[0].length));
    links.push({
      from: match.index,
      to: match.index + match[0].length + (marker?.[0].length ?? 0),
      linktext,
      target,
      alias,
      refId: marker?.[1] ?? null,
    });
  }
  return links;
}

/** Resolve a rendered Live Preview anchor by its source line and ordinal among
 * links to the same target. A unique target in the whole note is a safe fallback
 * when CodeMirror cannot map a rendered link to its current source line. */
export function resolveLivePreviewReference(
  source: string,
  target: string,
  sourceLine: string | null,
  targetOrdinal: number | null,
  renderedTargetCount: number | null,
): string | null {
  if (sourceLine !== null && targetOrdinal !== null && renderedTargetCount !== null) {
    const lineLinks = parseWikiLinks(sourceLine).filter((link) => link.target === target);
    if (lineLinks.length === renderedTargetCount) {
      return lineLinks[targetOrdinal]?.refId ?? null;
    }
  }

  const allLinks = parseWikiLinks(source).filter((link) => link.target === target);
  return allLinks.length === 1 ? allLinks[0].refId : null;
}

export function findSmartReferenceAtOffset(
  source: string,
  offset: number,
): SmartReferenceLink | null {
  return (
    parseSmartReferenceLinks(source).find(
      (link) => offset >= link.from && offset <= link.from + link.linktext.length + 4,
    ) ?? null
  );
}

export function annotateRenderedSmartReferences(root: HTMLElement, source: string): void {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>("a.internal-link"));
  const used = new Set<HTMLAnchorElement>();

  for (const link of parseSmartReferenceLinks(source)) {
    const anchor = anchors.find((candidate) => {
      if (used.has(candidate)) return false;
      const href = candidate.dataset.href ?? candidate.getAttribute("data-href") ?? "";
      if (href !== link.target) return false;
      return link.alias === null || candidate.textContent === unescapeAlias(link.alias);
    });
    if (!anchor) continue;
    anchor.setAttribute(SMART_REF_ATTRIBUTE, link.refId);
    used.add(anchor);
  }
}

function findUnescapedAliasSeparator(linktext: string): number {
  for (let index = 0; index < linktext.length; index += 1) {
    if (linktext[index] !== "|") continue;
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && linktext[cursor] === "\\"; cursor -= 1) {
      backslashes += 1;
    }
    if (backslashes % 2 === 0) return index;
  }
  return -1;
}

function unescapeAlias(alias: string): string {
  return alias.replace(/\\\|/g, "|");
}
