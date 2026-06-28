import { Button, Section, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

/**
 * Ownership-transfer email (D.1): sent to the NEW owner after a trip's
 * ownership moves to them. This is the only membership-change email — joins and
 * role changes stay in the in-app feed so inboxes don't get noisy.
 */
export interface OwnershipTransferEmailProps {
  /** Trip whose ownership just moved. */
  tripName: string;
  /** Display name of the new owner (the recipient). */
  newOwnerName: string;
  /** Display name of the previous owner who transferred it. */
  previousOwnerName: string;
  /** Absolute URL to the trip workspace. */
  tripUrl: string;
}

export function OwnershipTransferEmail({
  tripName,
  newOwnerName,
  previousOwnerName,
  tripUrl,
}: OwnershipTransferEmailProps) {
  const preview = `You're now the owner of ${tripName}`;
  return (
    <EmailLayout preview={preview}>
      <Text style={heading}>You're now the owner</Text>
      <Text style={paragraph}>
        Hi {newOwnerName}, {previousOwnerName} transferred ownership of <strong>{tripName}</strong>{" "}
        to you. As the owner you can manage members, send invites, and transfer the trip on if you
        ever need to.
      </Text>
      <Section style={buttonWrap}>
        <Button href={tripUrl} style={button}>
          Open the trip
        </Button>
      </Section>
      <Text style={fallback}>
        Or paste this link into your browser:
        <br />
        {tripUrl}
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
