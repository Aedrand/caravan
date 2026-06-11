import { expect, test } from "vitest";
import { createId } from "./id";
import { parseMutation } from "./mutations";

const base = (linkUrl: string) => ({
  id: createId(),
  type: "activity.create",
  payload: {
    activityId: createId(),
    title: "Tram 28",
    date: null,
    position: "a0",
    linkUrl,
  },
});

test("linkUrl accepts http(s) link-outs", () => {
  expect(() => parseMutation(base("https://example.com/tickets"))).not.toThrow();
  expect(() => parseMutation(base("http://example.com"))).not.toThrow();
});

test.each([
  "javascript:alert(1)",
  "data:text/html,<script>x</script>",
  "vbscript:msgbox",
])("linkUrl rejects dangerous scheme on create and update: %s", (url) => {
  expect(() => parseMutation(base(url))).toThrow();
  expect(() =>
    parseMutation({
      id: createId(),
      type: "activity.update",
      payload: { activityId: createId(), patch: { linkUrl: url } },
    }),
  ).toThrow();
});
