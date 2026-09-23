export const SMART_REF_ATTRIBUTE = "data-smart-ref-id";

export interface SmartReferenceLink {
  from: number;
  to: number;
  linktext: string;
  target: string;
  alias: string | null;
  refId: string;
}

const SMART_LINK_PATTERN = /\[\[([^\]]+)\]\]([ \t]*)%%ref:([A-Za-z0-9_-]+)%%/g;

export function parseSmartReferenceLinks(source: string): SmartReferenceLink[] {
  const links: SmartReferenceLink[] = [];
  for (const match of source.matchAll(SMART_LINK_PATTERN)) {
    if (match.index === undefined) continue;
    const linktext = match[1];
    const aliasSeparator = findUnescapedAliasSeparator(linktext);
    const target = aliasSeparator === -1 ? linktext : linktext.slice(0, aliasSeparator);
    const alias = aliasSeparator === -1 ? null : linktext.slice(aliasSeparator + 1);
    links.push({
      from: match.index,
      to: match.index + match[0].length,
      linktext,
      target,
      alias,
      refId: match[3],
    });
  }
  return links;
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
