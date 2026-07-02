/**
 * A deliberately-small markdown subset for the group bulletin. `trips.bulletin`
 * is a plain TEXT column with existing plain-text rows, so the grammar only
 * activates on literal tokens — anything else must round-trip untouched:
 *
 *   **bold**, *italic* / _italic_    single-pass inline, no nesting
 *   "- " / "* " line prefix          grouped into one bullet list
 *   "1. " line prefix                grouped into one numbered list
 *   blank line                       paragraph separator
 *
 * A single \n inside a paragraph is preserved (the renderer emits <br/>). This
 * module is pure string → data; the React rendering (XSS-safe by construction,
 * the `linkify.tsx` idiom — user text only ever becomes React text nodes) lives
 * in `bulletin-markdown-view.tsx`.
 */

export type Block =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "bullet-list"; items: string[] }
  | { kind: "numbered-list"; items: string[] };

/** "- item" / "* item" (marker must sit at column 0 — no nesting). */
const BULLET_RE = /^[-*]\s+(.*)$/;

/**
 * "1. item" — capped at three digits so prose lines that happen to open with a
 * year ("2024. What a trip…") stay plain paragraphs (migration safety).
 */
const NUMBERED_RE = /^\d{1,3}\.\s+(.*)$/;

export function parseBulletinBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (BULLET_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = (lines[i] ?? "").match(BULLET_RE);
        if (!m) break;
        items.push(m[1] ?? "");
        i++;
      }
      blocks.push({ kind: "bullet-list", items });
    } else if (NUMBERED_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = (lines[i] ?? "").match(NUMBERED_RE);
        if (!m) break;
        items.push(m[1] ?? "");
        i++;
      }
      blocks.push({ kind: "numbered-list", items });
    } else {
      const paraLines: string[] = [];
      while (i < lines.length) {
        const l = lines[i] ?? "";
        if (l.trim() === "" || BULLET_RE.test(l) || NUMBERED_RE.test(l)) break;
        paraLines.push(l);
        i++;
      }
      blocks.push({ kind: "paragraph", lines: paraLines });
    }
  }
  return blocks;
}

export type InlineSegment =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string };

/**
 * One alternative per marker so markers can never cross-pair (`*a_` stays
 * literal). Guards, in service of the zero-migration rule:
 *
 * - bold/italic content can't start or end with whitespace, so free-standing
 *   asterisks in prose ("5 * 3 * 2") don't emphasize;
 * - content also can't start or end with its own marker character, so the
 *   closer is always the nearest marker and "**a***b*" reads as bold(a) +
 *   italic(b) instead of bold overshooting to "a*";
 * - `_` only pairs at word boundaries, so snake_case and URL paths with
 *   underscores stay literal.
 */
const INLINE_RE =
  /\*\*([^\s*](?:.*?[^\s*])?)\*\*|\*([^\s*](?:[^*]*?[^\s*])?)\*|(?<!\w)_([^\s_](?:[^_]*?[^\s_])?)_(?!\w)/g;

export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  INLINE_RE.lastIndex = 0;
  let last = 0;
  let m = INLINE_RE.exec(text);
  while (m !== null) {
    if (m.index > last) segments.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) segments.push({ kind: "bold", text: m[1] });
    else segments.push({ kind: "italic", text: m[2] ?? m[3] ?? "" });
    last = INLINE_RE.lastIndex;
    m = INLINE_RE.exec(text);
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}
