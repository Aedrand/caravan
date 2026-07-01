import { describe, expect, it } from "vitest";
import { parseBulletinBlocks, parseInline } from "./bulletin-markdown";

describe("parseBulletinBlocks", () => {
  it("parses a plain paragraph", () => {
    expect(parseBulletinBlocks("Meet in the lobby at 9")).toEqual([
      { kind: "paragraph", lines: ["Meet in the lobby at 9"] },
    ]);
  });

  it("keeps a multi-line paragraph as ONE paragraph with lines intact (migration safety)", () => {
    // The pre-markdown bulletin was whitespace-pre-wrap plain text: a single \n
    // must stay a soft break inside one paragraph, character-for-character.
    const text = "Don't forget passports.\nHotel checkout is 11am — pack the night before.";
    expect(parseBulletinBlocks(text)).toEqual([
      {
        kind: "paragraph",
        lines: ["Don't forget passports.", "Hotel checkout is 11am — pack the night before."],
      },
    ]);
  });

  it("groups '- ' lines into one bullet list", () => {
    expect(parseBulletinBlocks("- sunscreen\n- adapters\n- yen")).toEqual([
      { kind: "bullet-list", items: ["sunscreen", "adapters", "yen"] },
    ]);
  });

  it("accepts '* ' as a bullet marker too", () => {
    expect(parseBulletinBlocks("* one\n* two")).toEqual([
      { kind: "bullet-list", items: ["one", "two"] },
    ]);
  });

  it("groups '1. ' lines into one numbered list", () => {
    expect(parseBulletinBlocks("1. land\n2. train to the hotel\n3. ramen")).toEqual([
      { kind: "numbered-list", items: ["land", "train to the hotel", "ramen"] },
    ]);
  });

  it("separates paragraphs on blank lines (runs of blanks collapse to one break)", () => {
    expect(parseBulletinBlocks("first\n\nsecond")).toEqual([
      { kind: "paragraph", lines: ["first"] },
      { kind: "paragraph", lines: ["second"] },
    ]);
    expect(parseBulletinBlocks("first\n\n\n\nsecond")).toEqual([
      { kind: "paragraph", lines: ["first"] },
      { kind: "paragraph", lines: ["second"] },
    ]);
  });

  it("splits a list out of an adjacent paragraph without needing a blank line", () => {
    expect(parseBulletinBlocks("Packing:\n- boots\n- hat\nthen we're off")).toEqual([
      { kind: "paragraph", lines: ["Packing:"] },
      { kind: "bullet-list", items: ["boots", "hat"] },
      { kind: "paragraph", lines: ["then we're off"] },
    ]);
  });

  it("parses a mixed document", () => {
    const text = "Intro line\n\n- a\n- b\n\n1. first\n2. second\n\noutro one\noutro two";
    expect(parseBulletinBlocks(text)).toEqual([
      { kind: "paragraph", lines: ["Intro line"] },
      { kind: "bullet-list", items: ["a", "b"] },
      { kind: "numbered-list", items: ["first", "second"] },
      { kind: "paragraph", lines: ["outro one", "outro two"] },
    ]);
  });

  it("does not treat mid-line or indented dashes as list markers", () => {
    // "-" needs to sit at column 0 followed by whitespace — plain prose with
    // dashes (and indented dashes; there is no nesting) stays a paragraph.
    expect(parseBulletinBlocks("wake up - then coffee\n  - not a list\n-nor this")).toEqual([
      { kind: "paragraph", lines: ["wake up - then coffee", "  - not a list", "-nor this"] },
    ]);
  });

  it("does not treat a leading year as a numbered-list marker", () => {
    expect(parseBulletinBlocks("2024. What a year that was")).toEqual([
      { kind: "paragraph", lines: ["2024. What a year that was"] },
    ]);
    expect(parseBulletinBlocks("12. still a list item")).toEqual([
      { kind: "numbered-list", items: ["still a list item"] },
    ]);
  });

  it("returns no blocks for empty or whitespace-only text", () => {
    expect(parseBulletinBlocks("")).toEqual([]);
    expect(parseBulletinBlocks("  \n\n  ")).toEqual([]);
  });
});

describe("parseInline", () => {
  it("returns text with no markdown as ONE untouched segment (migration safety)", () => {
    const text = "Plain note: call the ryokan, split was 3,200¥ each.";
    expect(parseInline(text)).toEqual([{ kind: "text", text }]);
  });

  it("parses **bold**", () => {
    expect(parseInline("**bold**")).toEqual([{ kind: "bold", text: "bold" }]);
    expect(parseInline("a **b c** d")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b c" },
      { kind: "text", text: " d" },
    ]);
  });

  it("parses italic with either marker", () => {
    expect(parseInline("*starry*")).toEqual([{ kind: "italic", text: "starry" }]);
    expect(parseInline("_undersea_")).toEqual([{ kind: "italic", text: "undersea" }]);
  });

  it("handles adjacent and interleaved segments", () => {
    expect(parseInline("**a***b*")).toEqual([
      { kind: "bold", text: "a" },
      { kind: "italic", text: "b" },
    ]);
    expect(parseInline("**a** and *b* or _c_!")).toEqual([
      { kind: "bold", text: "a" },
      { kind: "text", text: " and " },
      { kind: "italic", text: "b" },
      { kind: "text", text: " or " },
      { kind: "italic", text: "c" },
      { kind: "text", text: "!" },
    ]);
  });

  it("never pairs a * with a _ (cross-marker)", () => {
    // The spec'd single-class regex ([*_](.+?)[*_]) would have italicized "a"
    // here; one alternative per marker keeps mismatched markers literal.
    expect(parseInline("*a_")).toEqual([{ kind: "text", text: "*a_" }]);
    expect(parseInline("_a*")).toEqual([{ kind: "text", text: "_a*" }]);
    expect(parseInline("*a_b* stays star-paired")).toEqual([
      { kind: "italic", text: "a_b" },
      { kind: "text", text: " stays star-paired" },
    ]);
  });

  it("leaves unterminated markers literal", () => {
    expect(parseInline("**abc")).toEqual([{ kind: "text", text: "**abc" }]);
    expect(parseInline("*abc")).toEqual([{ kind: "text", text: "*abc" }]);
    expect(parseInline("abc_")).toEqual([{ kind: "text", text: "abc_" }]);
  });

  it("does not emphasize free-standing asterisks in prose (whitespace flanking)", () => {
    // Legacy plain text like "5 * 3 * 2" must not sprout italics.
    expect(parseInline("5 * 3 * 2")).toEqual([{ kind: "text", text: "5 * 3 * 2" }]);
    expect(parseInline("** not bold **")).toEqual([{ kind: "text", text: "** not bold **" }]);
  });

  it("does not italicize snake_case or underscored URL paths (word-boundary _)", () => {
    expect(parseInline("see trip_notes_v2 for details")).toEqual([
      { kind: "text", text: "see trip_notes_v2 for details" },
    ]);
    expect(parseInline("https://example.com/some_page_name")).toEqual([
      { kind: "text", text: "https://example.com/some_page_name" },
    ]);
    // …while a normally-delimited _italic_ still works next to punctuation.
    expect(parseInline("see _this_.")).toEqual([
      { kind: "text", text: "see " },
      { kind: "italic", text: "this" },
      { kind: "text", text: "." },
    ]);
  });
});

describe("plain-text round-trip (zero-migration guarantee)", () => {
  it("a multi-line legacy bulletin becomes one paragraph with every line intact", () => {
    const legacy = "Rules of the house:\nquiet after 10pm — thin walls\nvenmo Dan for the van";
    const blocks = parseBulletinBlocks(legacy);
    expect(blocks).toEqual([
      {
        kind: "paragraph",
        lines: ["Rules of the house:", "quiet after 10pm — thin walls", "venmo Dan for the van"],
      },
    ]);
    // Re-joining the parsed lines reproduces the stored text exactly.
    const only = blocks[0];
    expect(only?.kind === "paragraph" && only.lines.join("\n")).toBe(legacy);
    // And every line survives inline parsing as a single untouched text run.
    if (only?.kind === "paragraph") {
      for (const line of only.lines) {
        expect(parseInline(line)).toEqual([{ kind: "text", text: line }]);
      }
    }
  });
});
