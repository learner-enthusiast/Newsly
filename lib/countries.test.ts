import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterCountryOptions } from "./countries";

describe("filterCountryOptions", () => {
  it("returns empty list for blank query", () => {
    assert.deepEqual(filterCountryOptions(""), []);
    assert.deepEqual(filterCountryOptions("   "), []);
  });

  it("prioritizes prefix matches before substring matches", () => {
    const results = filterCountryOptions("uni");
    const names = results.map((row) => row.name);
    assert.ok(names.some((name) => name.startsWith("Uni")));
    const firstSubstringOnly = names.findIndex(
      (name) => !name.toLowerCase().startsWith("uni"),
    );
    const lastPrefix = names.reduce(
      (acc, name, index) =>
        name.toLowerCase().startsWith("uni") ? index : acc,
      -1,
    );
    if (firstSubstringOnly >= 0 && lastPrefix >= 0) {
      assert.ok(lastPrefix < firstSubstringOnly);
    }
  });

  it("returns country names not ISO codes as selectable values", () => {
    const results = filterCountryOptions("ind");
    const india = results.find((row) => row.code === "IN");
    assert.ok(india);
    assert.equal(india.name, "India");
  });
});
