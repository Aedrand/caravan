import { render } from "@react-email/render";
import nodemailer, { type Transporter } from "nodemailer";
import type { ReactElement } from "react";
import type { Config } from "../../config";
import type { Logger } from "../../logger";

/**
 * Transactional email service (D.1). The whole feature is OFF until SMTP is
 * configured (host + from address): every send becomes a no-op, so invites and
 * digests work the same on a fresh self-host with no relay — they just don't
 * email. Email must NEVER break a mutation, so transport errors are swallowed.
 *
 * Feature templates compose `EmailLayout` (templates/layout.tsx), render via
 * `renderEmail`, then hand the html/text to `sendMail`.
 */

type SmtpConfig = Config["smtp"];

/** The two fields that decide whether email is on; the full config satisfies this. */
type EmailConfig = { smtp: Pick<SmtpConfig, "host" | "from"> };

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text alternative; recommended (renderEmail produces one). */
  text?: string;
}

/** True only when SMTP is configured enough to actually send: host + from. */
export function isEmailEnabled(config: EmailConfig): boolean {
  return Boolean(config.smtp.host && config.smtp.from);
}

/** Build a nodemailer transport from SMTP config. Caller guarantees host is set. */
function buildTransport(smtp: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    // Auth is optional: some relays accept unauthenticated submission from a
    // trusted network. Only pass credentials when a user is configured.
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
  });
}

/**
 * The email gateway shared by every feature. Construct once at boot (it logs
 * its on/off status) and inject it; `sendMail` is a no-op when email is off and
 * swallows transport errors so a failed send can't fail the surrounding request.
 */
export function createEmailService(config: Pick<Config, "smtp">, logger: Logger) {
  const enabled = isEmailEnabled(config);
  // Lazily built on first send so a misconfigured-but-disabled instance never
  // touches nodemailer, and a disabled instance allocates nothing.
  let transport: Transporter | undefined;

  return {
    enabled,

    async sendMail(opts: SendMailOptions): Promise<void> {
      if (!enabled) {
        logger.debug({ to: opts.to, subject: opts.subject }, "email disabled, skipping");
        return;
      }
      transport ??= buildTransport(config.smtp);
      try {
        await transport.sendMail({
          from: config.smtp.from,
          to: opts.to,
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
        });
        logger.debug({ to: opts.to, subject: opts.subject }, "email sent");
      } catch (err) {
        // Email is best-effort: log and swallow so a relay outage never breaks
        // the mutation (invite accept, etc.) that triggered the send.
        logger.error({ err, to: opts.to, subject: opts.subject }, "email send failed");
      }
    },
  };
}

export type EmailService = ReturnType<typeof createEmailService>;

/**
 * Render a react-email element to both HTML and a plain-text alternative.
 * Feature templates return an element built around `EmailLayout`; this turns it
 * into the `{ html, text }` pair `sendMail` wants.
 */
export async function renderEmail(element: ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
