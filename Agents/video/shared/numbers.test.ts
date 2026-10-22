import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countWords,
  extractNumbers,
  numbersMatch,
  splitSentences,
  unsupportedNumbers,
} from "./numbers";

describe("extractNumbers", () => {
  it("normalises currency, separators and Indian scales", () => {
    const [a] = extractNumbers("₹1,200 cr");
    const [b] = extractNumbers("1200 crore");
    const [c] = extractNumbers("₹१,२०० करोड़");
    for (const token of [a, b, c]) {
      assert.equal(token.value, 1200);
      assert.equal(token.scale, "crore");
    }
  });

  it("reads percents in English and Hindi", () => {
    assert.equal(extractNumbers("up 4.5%")[0].scale, "percent");
    assert.equal(extractNumbers("4.5 प्रतिशत")[0].scale, "percent");
    assert.equal(extractNumbers("4.5 per cent")[0].scale, "percent");
  });

  it("does not treat units or labels as scales/quantities", () => {
    assert.deepEqual(
      extractNumbers("5 km away").map((t) => [t.value, t.scale]),
      [[5, null]],
    );
    assert.deepEqual(extractNumbers("Q3 results and G20"), []);
  });
});

describe("numbersMatch", () => {
  it("matches equal values with compatible scales", () => {
    const [script] = extractNumbers("1,200");
    const [fact] = extractNumbers("₹1,200 crore");
    assert.equal(numbersMatch(script, fact), true);
    assert.equal(
      numbersMatch(extractNumbers("1200 lakh")[0], fact),
      false,
    );
  });

  it("matches the same amount across scales", () => {
    assert.equal(
      numbersMatch(extractNumbers("120 billion")[0], extractNumbers("12,000 crore")[0]),
      true,
    );
  });
});

describe("unsupportedNumbers", () => {
  it("flags numbers absent from the allowed list", () => {
    const allowed = extractNumbers("Revenue rose 12% to ₹3,400 crore in 2025.");
    assert.deepEqual(
      unsupportedNumbers("Revenue hit 3,400 crore, up 15%.", allowed).map((t) => t.raw),
      ["15%"],
    );
  });
});

describe("text helpers", () => {
  it("splits English and Hindi sentences and counts words", () => {
    assert.deepEqual(splitSentences("One. Two? तीन। चार"), ["One.", "Two?", "तीन।", "चार"]);
    assert.equal(countWords("  यह एक  वाक्य है "), 4);
  });
});
