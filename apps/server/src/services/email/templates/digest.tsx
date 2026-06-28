import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

/**
 * Daily digest email (D.2): "what changed today" for one trip. Composes the
 * shared EmailLayout and lists the human-readable activity lines the digest job
 * derived from the last 24h of feed events, with a button back to the trip.
 */
export interface DigestEmailProps {
  tripName: string;
  /** Pre-rendered activity lines, e.g. "Alex added Lunch at X" (newest last). */
  lines: string[];
  /** Absolute link to the trip in this Caravan instance. */
  tripUrl: string;
}

export function DigestEmail({ tripName, lines, tripUrl }: DigestEmailProps) {
  const count = lines.length;
  const preview = `${count} ${count === 1 ? "update" : "updates"} on ${tripName} today`;

  return (
    <EmailLayout preview={preview}>
      <Heading style={heading}>{tripName}</Heading>
      <Text style={summary}>
        {count === 1
          ? "1 thing changed in the last day:"
          : `${count} things changed in the last day:`}
      </Text>
      <Section style={list}>
        {lines.map((line, i) => (
          // Lines are positional digest copy with no stable id; index is fine.
          // biome-ignore lint/suspicious/noArrayIndexKey: static, non-reordered list
          <Text key={i} style={item}>
            • {line}
          </Text>
        ))}
      </Section>
      <Section style={buttonWrap}>
        <Button href={tripUrl} style={button}>
          View trip
        </Button>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "18px",
  fontWeight: 700,
  color: "#1f2933",
  margin: "0 0 4px",
};

const summary = {
  fontSize: "14px",
  color: "#52606d",
  margin: "0 0 12px",
};

const list = {
  margin: "0 0 20px",
};

const item = {
  fontSize: "14px",
  color: "#1f2933",
  lineHeight: "22px",
  margin: "0 0 4px",
};

const buttonWrap = {
  marginTop: "8px",
};

const button = {
  backgroundColor: "#1f2933",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  padding: "10px 18px",
  textDecoration: "none",
};
