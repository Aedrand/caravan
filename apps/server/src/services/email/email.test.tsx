import { Text } from "@react-email/components";
import pino from "pino";
import { expect, test } from "vitest";
import { createEmailService, isEmailEnabled, renderEmail } from "./index";
import { EmailLayout } from "./templates/layout";

const silentLogger = pino({ level: "silent" });

/** A fully-shaped smtp config with email OFF (no host/from). */
const disabledSmtp = {
  smtp: {
    host: undefined,
    port: 587,
    user: undefined,
    pass: undefined,
    secure: false,
    from: undefined,
  },
};

test("renderEmail produces HTML and a plain-text alternative", async () => {
  const { html, text } = await renderEmail(
    <EmailLayout preview="A trivial email">
      <Text>Hello from the trip.</Text>
    </EmailLayout>,
  );

  // The layout chrome and the composed content both make it into the HTML.
  expect(html).toContain("Caravan");
  expect(html).toContain("Hello from the trip.");
  expect(html).toContain("<!DOCTYPE html");

  // Plain-text fallback carries the readable copy without markup.
  expect(text).toContain("Hello from the trip.");
  expect(text).not.toContain("<html");
});

test("isEmailEnabled requires both host and from", () => {
  expect(isEmailEnabled({ smtp: { host: undefined, from: undefined } })).toBe(false);
  expect(isEmailEnabled({ smtp: { host: "smtp.example.com", from: undefined } })).toBe(false);
  expect(isEmailEnabled({ smtp: { host: undefined, from: "a@b.com" } })).toBe(false);
  expect(isEmailEnabled({ smtp: { host: "smtp.example.com", from: "a@b.com" } })).toBe(true);
});

test("sendMail is a no-op (never throws) when email is disabled", async () => {
  const email = createEmailService(disabledSmtp, silentLogger);
  expect(email.enabled).toBe(false);
  await expect(
    email.sendMail({ to: "a@b.com", subject: "hi", html: "<p>hi</p>" }),
  ).resolves.toBeUndefined();
});
