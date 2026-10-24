import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { isNewsletterEmailStopped } from "@/lib/newsletter/stopSwitch";

const original = process.env.STOP_NEWSLETTER_EMAIL;

afterEach(() => {
  if (original === undefined) {
    delete process.env.STOP_NEWSLETTER_EMAIL;
  } else {
    process.env.STOP_NEWSLETTER_EMAIL = original;
  }
});

test("newsletter email runs by default", () => {
  delete process.env.STOP_NEWSLETTER_EMAIL;
  assert.equal(isNewsletterEmailStopped(), false);
});

test("STOP_NEWSLETTER_EMAIL=true or 1 stops newsletters", () => {
  for (const value of ["true", "TRUE", " true ", "1"]) {
    process.env.STOP_NEWSLETTER_EMAIL = value;
    assert.equal(isNewsletterEmailStopped(), true, value);
  }
});

test("any other value keeps newsletters running", () => {
  for (const value of ["false", "0", "", "yes"]) {
    process.env.STOP_NEWSLETTER_EMAIL = value;
    assert.equal(isNewsletterEmailStopped(), false, value);
  }
});
