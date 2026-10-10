import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatNewsMetroLabel, localNewsParamsForMetro } from "./metroHelpers";

describe("metroLocation helpers", () => {
  it("formats metro label", () => {
    assert.equal(
      formatNewsMetroLabel({ name: "Mumbai", country: "India" }),
      "Mumbai, India",
    );
  });

  it("builds local news params with English hl by default", () => {
    const params = localNewsParamsForMetro({
      name: "Mumbai",
      aliases: ["Bombay"],
      countryCode: "in",
      lang: "hi",
    });
    assert.equal(params.gl, "in");
    assert.equal(params.hl, "en");
    assert.match(params.q, /Mumbai/);
    assert.match(params.q, /Bombay/);
  });
});
