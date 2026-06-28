import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Shared chrome for every Caravan email (D.1): a header with the product name
 * and a plain footer. Feature templates (invite, membership, digest) compose
 * their content as children so the framing stays consistent in one place.
 */
export interface EmailLayoutProps {
  /** Inbox preview line (the snippet shown before the body opens). */
  preview: string;
  children: ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>Caravan</Text>
          </Section>
          <Section>{children}</Section>
          <Hr style={rule} />
          <Section>
            <Text style={footer}>
              You're receiving this because you use Caravan to plan a trip. Manage your email
              preferences from your account settings.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: "#f6f5f2",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const container = {
  margin: "0 auto",
  padding: "24px",
  maxWidth: "560px",
};

const header = {
  paddingBottom: "8px",
};

const brand = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#1f2933",
  margin: 0,
};

const rule = {
  borderColor: "#e3e0d8",
  margin: "24px 0 16px",
};

const footer = {
  fontSize: "12px",
  color: "#7b8794",
  lineHeight: "18px",
  margin: 0,
};
