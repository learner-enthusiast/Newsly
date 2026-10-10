import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  autocompletePrefixQueries,
  filterCachedSuggestionsForQuery,
  normalizeAutocompleteQuery,
} from "@/services/location/autocompleteQuery";
import type { LocationAutocompleteSuggestion } from "@/services/location/userLocationTypes";

describe("normalizeAutocompleteQuery", () => {
  it("normalizes casing and spacing", () => {
    assert.equal(normalizeAutocompleteQuery(" Kolkata  "), "kolkata");
    assert.equal(normalizeAutocompleteQuery("KOLKATA"), "kolkata");
    assert.equal(normalizeAutocompleteQuery("kolkata   "), "kolkata");
  });
});

describe("autocompletePrefixQueries", () => {
  it("returns longest prefixes first", () => {
    assert.deepEqual(autocompletePrefixQueries("kolkata"), [
      "kolkat",
      "kolka",
      "kolk",
      "kol",
      "ko",
    ]);
  });
});

describe("filterCachedSuggestionsForQuery", () => {
  const sample: LocationAutocompleteSuggestion[] = [
    { value: "Kolkata, West Bengal, India", type: "keyword" },
    { value: "Kolkata Metro", type: "keyword" },
    { value: "Kolkata Airport", type: "keyword" },
    { value: "Kolkata News", type: "keyword" },
    { value: "Kolkata Weather", type: "keyword" },
    { value: "Kochi, Kerala, India", type: "keyword" },
  ];

  it("filters prefix matches for kolk", () => {
    const filtered = filterCachedSuggestionsForQuery(sample, "kolk");
    assert.equal(filtered.length, 5);
  });

  it("returns fewer matches for specific metro query", () => {
    const filtered = filterCachedSuggestionsForQuery(sample, "kolkata metro");
    assert.equal(filtered.length, 1);
  });
});
