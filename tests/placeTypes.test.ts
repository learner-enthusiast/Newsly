import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveAreaLabel } from "@/services/planner/normalize/areaLabel";
import { mapsResultToInternalPlace } from "@/services/planner/normalize/place";
import {
  classifyPlaceType,
  festivalTokens,
  placeTypeToPlanItemType,
} from "@/services/planner/normalize/placeType";

/** Mocked SerpApi Google Maps results — no network access. */
const gauriBari = {
  title: "Gauri Bari Sarbojanin Durga Puja Pandal",
  address: "4, Gouri Bari Ln, Manicktala, Gouri Bari, Kolkata, West Bengal 700004",
  place_id: "ChIJ81z1Lzx2AjoRgdxHCz5dETs",
  type: "Hindu temple",
  gps_coordinates: { latitude: 22.5944481, longitude: 88.3790856 },
  rating: 4.5,
  reviews: 218,
};

const unrelatedTemple = {
  title: "Lake Kalibari",
  address: "Southern Ave, Lake Town, Kolkata, West Bengal 700029",
  place_id: "ChIJtemple",
  type: "Hindu temple",
  gps_coordinates: { latitude: 22.5115, longitude: 88.3512 },
};

const streetFoodStall = {
  title: "YUMPTY FOOD STREET",
  address: "125, Muktaram Babu Street, Girish Park N, Kolkata, West Bengal 700007",
  place_id: "ChIJfood",
  type: "Street food restaurant",
  gps_coordinates: { latitude: 22.5823266, longitude: 88.3629536 },
};

const tokens = festivalTokens("Durga Puja");

test("a researched pandal listed by Google as a temple becomes a pandal", () => {
  const place = mapsResultToInternalPlace(gauriBari, {
    city: "Kolkata",
    festivalTokens: tokens,
    discoveryIntent: "festival",
    evidence:
      "The Gauri Bari Sarbojanin Durga Puja Pandal in Manicktala is among the oldest community pujas of north Kolkata.",
  });

  assert.equal(place.type, "pandal");
});

test("a temple with no festival evidence stays a temple", () => {
  const place = mapsResultToInternalPlace(unrelatedTemple, {
    city: "Kolkata",
    festivalTokens: tokens,
    discoveryIntent: "festival",
  });

  assert.equal(place.type, "temple");
});

test("a food venue surfacing in the festival search is not typed as a pandal", () => {
  const place = mapsResultToInternalPlace(streetFoodStall, {
    city: "Kolkata",
    festivalTokens: tokens,
    discoveryIntent: "festival",
  });

  assert.equal(place.type, "food");
});

test("food discovery keeps restaurant, street food, and cafe distinct", () => {
  const restaurant = classifyPlaceType({
    name: "Agarwal's Pav Bhaji",
    rawType: "Restaurant",
    discoveryIntent: "food",
  });
  const streetFood = classifyPlaceType({
    name: "Hot Kati Rolls",
    rawType: "Street food stall",
    discoveryIntent: "food",
  });
  const cafe = classifyPlaceType({
    name: "Flurys Coffee House",
    rawType: "Cafe",
    discoveryIntent: "food",
  });

  assert.equal(restaurant.type, "restaurant");
  assert.equal(streetFood.type, "food");
  assert.equal(cafe.type, "cafe");
});

test("festival terminology is taken from the requested festival, not a fixed list", () => {
  const ganesh = classifyPlaceType({
    name: "Lalbaugcha Raja Ganesh Mandal",
    rawType: "Community center",
    festivalTokens: festivalTokens("Ganesh Chaturthi"),
    discoveryIntent: "festival",
  });

  assert.equal(ganesh.type, "pandal");
});

test("festival stops map to pandal items instead of the misleading event type", () => {
  assert.equal(placeTypeToPlanItemType("pandal"), "pandal");
  assert.equal(placeTypeToPlanItemType("temple"), "pandal");
  assert.equal(placeTypeToPlanItemType("restaurant"), "restaurant");
  assert.equal(placeTypeToPlanItemType("food"), "food");
});

test("area labels are derived from the address, skipping roads and pin codes", () => {
  assert.equal(
    deriveAreaLabel(
      "21, Purbachal Main Rd, Shanti Pally, South Purbachal, Haltu, Kolkata, West Bengal 700078",
      "Kolkata",
    ),
    "Haltu",
  );
  assert.equal(
    deriveAreaLabel("4, Gouri Bari Ln, Manicktala, Kolkata, West Bengal 700004", "Kolkata"),
    "Manicktala",
  );
  assert.equal(deriveAreaLabel(null, "Kolkata"), null);
});
