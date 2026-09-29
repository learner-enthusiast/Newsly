import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractAutocompleteSuggestions,
  formatLocationLabelFromSuggestion,
  formatLocationStorageValueFromSuggestion,
  pickFirstAutocompleteGeo,
  readSuggestionCoordinates,
} from "./mapsAutocomplete";
import type { LocationAutocompleteSuggestion } from "./userLocationTypes";

describe("extractAutocompleteSuggestions", () => {
  it("reads gps_coordinates from Serp suggestion rows", () => {
    const rows = extractAutocompleteSuggestions({
      suggestions: [
        {
          value: "Charminar",
          subtext: "Hyderabad, Telangana, India",
          gps_coordinates: { latitude: 17.3616, longitude: 78.4747 },
        },
      ],
    });
    assert.deepEqual(readSuggestionCoordinates(rows[0]!), {
      latitude: 17.3616,
      longitude: 78.4747,
    });
  });
});

describe("pickFirstAutocompleteGeo", () => {
  it("uses the first suggestion coordinates", () => {
    const geo = pickFirstAutocompleteGeo([
      {
        value: "Hyderabad",
        latitude: 17.385,
        longitude: 78.4867,
      },
      {
        value: "Hyderabad Airport",
        latitude: 17.24,
        longitude: 78.43,
      },
    ]);
    assert.deepEqual(geo, { latitude: 17.385, longitude: 78.4867 });
  });
});

describe("formatLocationStorageValueFromSuggestion", () => {
  it("keeps full subtext for place suggestions", () => {
    const suggestion: LocationAutocompleteSuggestion = {
      value: "Charminar",
      subtext: "Charminar Rd, Ghansi Bazaar, Hyderabad, Telangana 500002, India",
    };
    assert.equal(
      formatLocationLabelFromSuggestion(suggestion),
      "Hyderabad, Telangana 500002, India",
    );
    assert.equal(
      formatLocationStorageValueFromSuggestion(suggestion),
      "Charminar Rd, Ghansi Bazaar, Hyderabad, Telangana 500002, India",
    );
  });

  it("falls back to value when subtext is missing", () => {
    const suggestion: LocationAutocompleteSuggestion = {
      value: "Hyderabad, Telangana, India",
    };
    assert.equal(
      formatLocationStorageValueFromSuggestion(suggestion),
      "Hyderabad, Telangana, India",
    );
  });
});
