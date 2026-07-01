import type { ReactNode } from "react";
import { type Block, parseBulletinBlocks, parseInline } from "./bulletin-markdown";

/**
 * Render the bulletin's markdown subset (see `bulletin-markdown.ts`) as React
 * elements — no HTML strings, no sanitizer: user text only ever becomes React
 * text nodes (the `linkify.tsx` idiom), so this is XSS-safe by construction.
 *
 * Nodes are keyed by running source offset (linkify's convention) rather than
 * array index. Paragraphs keep `whitespace-pre-wrap` so runs of spaces inside a
 * line render exactly as the plain-text bulletin always has; line breaks
 * themselves become explicit <br/> between parsed lines.
 */

/** One source line → text/bold/italic runs. */
function InlineText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const seg of parseInline(text)) {
    const key = `${seg.kind}${offset}`;
    if (seg.kind === "bold") {
      nodes.push(
        <strong key={key} className="font-bold">
          {seg.text}
        </strong>,
      );
    } else if (seg.kind === "italic") {
      nodes.push(
        <em key={key} className="italic">
          {seg.text}
        </em>,
      );
    } else {
      nodes.push(seg.text);
    }
    offset += seg.text.length;
  }
  return <>{nodes}</>;
}

function ListBlock({ block }: { block: Extract<Block, { items: string[] }> }) {
  const items: ReactNode[] = [];
  let offset = 0;
  for (const item of block.items) {
    items.push(
      <li key={`i${offset}`}>
        <InlineText text={item} />
      </li>,
    );
    offset += item.length + 1;
  }
  return block.kind === "bullet-list" ? (
    <ul className="ml-5 list-disc space-y-0.5">{items}</ul>
  ) : (
    <ol className="ml-5 list-decimal space-y-0.5">{items}</ol>
  );
}

function Paragraph({ lines }: { lines: string[] }) {
  const inner: ReactNode[] = [];
  let offset = 0;
  for (const line of lines) {
    if (inner.length > 0) inner.push(<br key={`b${offset}`} />);
    inner.push(<InlineText key={`l${offset}`} text={line} />);
    offset += line.length + 1;
  }
  return <p className="whitespace-pre-wrap">{inner}</p>;
}

export function BulletinMarkdown({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const block of parseBulletinBlocks(text)) {
    const key = `${block.kind}-${offset}`;
    if (block.kind === "paragraph") {
      nodes.push(<Paragraph key={key} lines={block.lines} />);
      offset += block.lines.reduce((n, l) => n + l.length + 1, 0);
    } else {
      nodes.push(<ListBlock key={key} block={block} />);
      offset += block.items.reduce((n, l) => n + l.length + 1, 0);
    }
  }
  return (
    <div className="flex flex-col gap-2 break-words text-foreground text-sm leading-relaxed">
      {nodes}
    </div>
  );
}
