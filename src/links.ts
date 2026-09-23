export const SMART_REF_ATTRIBUTE = "data-smart-ref-id";

export interface SmartReferenceLink {
  from: number;
  to: number;
  linktext: string;
  target: string;
  alias: string | null;
  refId: string;
}

export interface RenderedLinkIdentity {
  target: string;
}

type ResolveLinkPath = (path: string) => string;

interface WikiLink extends Omit<SmartReferenceLink, "refId"> {
  refId: string | null;
}

const WIKI_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;
const REF_MARKER_PATTERN = /^[ \t]*(?:<!--smart-ref:([A-Za-z0-9_-]+)-->|%%ref:([A-Za-z0-9_-]+)%%)/;

/** Keep the reference marker in the same Markdown paragraph as its link. */
export function buildSmartReferenceLink(path: string, blockId: string, selectedText: string, refId: string): string {
  const target = path.replace(/\.md$/i, "");
  const alias = selectedText.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  return `[[${target}#^${blockId}|${alias}]]<!--smart-ref:${refId}-->`;
}

export function parseSmartReferenceComment(comment: string): string | null {
  return /^smart-ref:([A-Za-z0-9_-]+)$/.exec(comment)?.[1] ?? null;
}

function adjacentCommentRefId(anchor: HTMLAnchorElement): string | null {
  let sibling = anchor.nextSibling;
  while (sibling?.nodeType === 3 && !sibling.textContent?.trim()) sibling = sibling.nextSibling;
  return sibling?.nodeType === 8 ? parseSmartReferenceComment(sibling.textContent ?? "") : null;
}

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
      refId: marker?.[1] ?? marker?.[2] ?? null,
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

export function annotateRenderedSmartReferences(
  root: HTMLElement,
  source: string,
  resolvePath: ResolveLinkPath = (path) => path,
): void {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href], a.internal-link"));
  const identities = anchors.map((anchor) => ({
    target: anchor.dataset.href || anchor.getAttribute("href") || "",
  }));
  const refIds = resolveRenderedReferenceIds(source, identities, resolvePath);
  for (const [index, sourceRefId] of refIds.entries()) {
    const refId = adjacentCommentRefId(anchors[index]) ?? sourceRefId;
    if (refId) anchors[index].setAttribute(SMART_REF_ATTRIBUTE, refId);
    else anchors[index].removeAttribute(SMART_REF_ATTRIBUTE);
  }
}

/** Pair block links by resolved target path, block ID, and same-target order.
 * All Wiki Links count, so an ordinary link cannot borrow a Smart ref ID.
 * Count mismatches stay unannotated because the rendered order is uncertain. */
export function resolveRenderedReferenceIds(
  source: string,
  anchors: readonly RenderedLinkIdentity[],
  resolvePath: ResolveLinkPath = (path) => path,
): Array<string | null> {
  const results: Array<string | null> = anchors.map(() => null);
  const sourceGroups = new Map<string, Array<string | null>>();
  for (const link of parseWikiLinks(source)) {
    const key = blockTargetKey(link.target, resolvePath);
    if (!key) continue;
    const group = sourceGroups.get(key) ?? [];
    group.push(link.refId);
    sourceGroups.set(key, group);
  }
  const renderedGroups = new Map<string, number[]>();
  anchors.forEach((anchor, index) => {
    const key = blockTargetKey(anchor.target, resolvePath);
    if (!key) return;
    const group = renderedGroups.get(key) ?? [];
    group.push(index);
    renderedGroups.set(key, group);
  });
  for (const [key, indexes] of renderedGroups) {
    const sourceIds = sourceGroups.get(key);
    if (!sourceIds || sourceIds.length !== indexes.length) continue;
    indexes.forEach((index, ordinal) => {
      results[index] = sourceIds[ordinal];
    });
  }
  return results;
}

function blockTargetKey(target: string, resolvePath: ResolveLinkPath): string | null {
  const marker = target.indexOf("#");
  if (marker < 0) return null;
  const rawPath = target.slice(0, marker);
  const rawFragment = target.slice(marker + 1);
  if (!rawPath || !rawFragment) return null;
  let path: string;
  let fragment: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    path = rawPath;
  }
  try {
    fragment = decodeURIComponent(rawFragment);
  } catch {
    fragment = rawFragment;
  }
  if (!fragment.startsWith("^") || fragment.length === 1) return null;
  const blockId = fragment.slice(1);
  return JSON.stringify([resolvePath(path), blockId]);
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
