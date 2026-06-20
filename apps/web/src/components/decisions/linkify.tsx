import { Fragment } from "react";

/**
 * Render plain text with bare http(s) URLs turned into safe links (PD-4: "plain
 * text with linkification"). Only http/https are linked — never javascript:/
 * data:, and the raw text is otherwise escaped by React, so this is XSS-safe.
 */
const URL_RE = /(https?:\/\/[^\s<>]+)/g;

type Segment =
  | { kind: "text"; key: string; text: string }
  | { kind: "link"; key: string; url: string; tail: string };

/** Split into text/link segments, keyed by character offset (stable, unique). */
function segment(text: string): Segment[] {
  const parts = text.split(URL_RE);
  const segments: Segment[] = [];
  let offset = 0;
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      // Trim trailing sentence punctuation that shouldn't be part of the URL.
      const match = part.match(/^(.*?)([.,!?;:)]*)$/);
      segments.push({
        kind: "link",
        key: `l${offset}`,
        url: match?.[1] ?? part,
        tail: match?.[2] ?? "",
      });
    } else if (part) {
      segments.push({ kind: "text", key: `t${offset}`, text: part });
    }
    offset += part.length;
  });
  return segments;
}

export function Linkify({ text }: { text: string }) {
  return (
    <>
      {segment(text).map((seg) =>
        seg.kind === "link" ? (
          <Fragment key={seg.key}>
            <a
              href={seg.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[var(--accent-strong)] underline underline-offset-2"
            >
              {seg.url}
            </a>
            {seg.tail}
          </Fragment>
        ) : (
          <Fragment key={seg.key}>{seg.text}</Fragment>
        ),
      )}
    </>
  );
}
