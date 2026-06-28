import { Button, Section, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

/**
 * Invite email (D.1): sent when a trip owner creates an invite link with a
 * recipient address. The big join Button carries the raw token's join URL; the
 * same URL is repeated as plain text below so the link survives clients that
 * strip buttons (and the plain-text alternative renderEmail produces).
 */
export interface InviteEmailProps {
  /** Trip the recipient is being invited to. */
  tripName: string;
  /** Display name of the member who created the invite. */
  inviterName: string;
  /** Role the invite grants once accepted ("editor" | "viewer"). */
  inviteRole: string;
  /** Absolute join URL: `${baseUrl}/join/${rawToken}`. */
  joinUrl: string;
}

export function InviteEmail({ tripName, inviterName, inviteRole, joinUrl }: InviteEmailProps) {
  const preview = `${inviterName} invited you to plan ${tripName} on Caravan`;
  return (
    <EmailLayout preview={preview}>
      <Text style={heading}>You're invited to a trip</Text>
      <Text style={paragraph}>
        {inviterName} invited you to join <strong>{tripName}</strong> on Caravan with the{" "}
        <strong>{inviteRole}</strong> role. Caravan is where the group plans the trip together —
        itinerary, decisions, and who owes who.
      </Text>
      <Section style={buttonWrap}>
        <Button href={joinUrl} style={button}>
          Join the trip
        </Button>
      </Section>
      <Text style={fallback}>
        Or paste this link into your browser:
        <br />
        {joinUrl}
      </Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "18px",
  fontWeight: 600,
  color: "#1f2933",
  margin: "0 0 12px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#3e4c59",
  margin: "0 0 20px",
};

const buttonWrap = {
  margin: "0 0 20px",
};

const button = {
  backgroundColor: "#1f2933",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 20px",
  textDecoration: "none",
};

const fallback = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#7b8794",
  margin: 0,
  wordBreak: "break-all" as const,
};
