import { z } from "zod";
import { prisma } from "@/db";
import { toNullableJson } from "./json";

const idSchema = z.string().min(1, "id is required");
const jsonValueSchema = z.unknown().nullable().optional();
const decimalSchema = z.union([z.number(), z.string()]);

const placeTypeSchema = z.enum([
  "pandal",
  "temple",
  "food",
  "restaurant",
  "cafe",
  "parking",
  "restroom",
  "atm",
  "pharmacy",
  "event",
  "other",
]);

const placeWriteSchema = z.object({
  name: z.string().min(1),
  type: placeTypeSchema,
  address: z.string().min(1).nullable().optional(),
  city: z.string().min(1).nullable().optional(),
  area: z.string().min(1).nullable().optional(),
  latitude: decimalSchema.nullable().optional(),
  longitude: decimalSchema.nullable().optional(),
  googlePlaceId: z.string().min(1).nullable().optional(),
  serpDataId: z.string().min(1).nullable().optional(),
  rating: decimalSchema.nullable().optional(),
  reviewCount: z.number().int().min(0).nullable().optional(),
  description: z.string().min(1).nullable().optional(),
  thumbnailUrl: z.string().min(1).nullable().optional(),
  hours: jsonValueSchema,
  metadata: jsonValueSchema,
  lastVerifiedAt: z.coerce.date().nullable().optional(),
});

const placeUpdateSchema = placeWriteSchema.partial();

const nameAddressCoordsSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
});

export type PlaceCreateInput = z.input<typeof placeWriteSchema>;
export type PlaceUpdateInput = z.input<typeof placeUpdateSchema>;
export type PlaceNameAddressCoordsInput = z.input<typeof nameAddressCoordsSchema>;

function normalizePlaceText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toCoordNumber(value: unknown) {
  if (value == null) {
    return null;
  }

  if (
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  ) {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordsMatch(left: unknown, right: number) {
  const parsed = toCoordNumber(left);
  return parsed != null && Math.abs(parsed - right) < 0.00001;
}

export async function findByGooglePlaceId(googlePlaceId: string) {
  return prisma.place.findUnique({
    where: { googlePlaceId: z.string().min(1).parse(googlePlaceId) },
  });
}

export async function findBySerpDataId(serpDataId: string) {
  return prisma.place.findFirst({
    where: { serpDataId: z.string().min(1).parse(serpDataId) },
  });
}

export async function findByNameAddressCoords(
  input: PlaceNameAddressCoordsInput,
) {
  const { name, address, latitude, longitude } =
    nameAddressCoordsSchema.parse(input);
  const normalizedName = normalizePlaceText(name);
  const normalizedAddress = normalizePlaceText(address);

  const candidates = await prisma.place.findMany({
    where: {
      name: { equals: name, mode: "insensitive" },
      address: { equals: address, mode: "insensitive" },
    },
  });

  return (
    candidates.find((place) => {
      const placeName = place.name ? normalizePlaceText(place.name) : "";
      const placeAddress = place.address
        ? normalizePlaceText(place.address)
        : "";

      return (
        placeName === normalizedName &&
        placeAddress === normalizedAddress &&
        coordsMatch(place.latitude, latitude) &&
        coordsMatch(place.longitude, longitude)
      );
    }) ?? null
  );
}

export async function createPlace(input: PlaceCreateInput) {
  const { hours, metadata, ...data } = placeWriteSchema.parse(input);

  return prisma.place.create({
    data: {
      ...data,
      hours: toNullableJson(hours),
      metadata: toNullableJson(metadata),
    },
  });
}

export async function updatePlace(id: string, input: PlaceUpdateInput) {
  const { hours, metadata, ...data } = placeUpdateSchema.parse(input);

  return prisma.place.update({
    where: { id: idSchema.parse(id) },
    data: {
      ...data,
      hours: toNullableJson(hours),
      metadata: toNullableJson(metadata),
    },
  });
}

export async function upsertPlace(input: PlaceCreateInput) {
  const data = placeWriteSchema.parse(input);
  const latitude = toCoordNumber(data.latitude);
  const longitude = toCoordNumber(data.longitude);

  const existing =
    (data.googlePlaceId
      ? await findByGooglePlaceId(data.googlePlaceId)
      : null) ??
    (data.serpDataId ? await findBySerpDataId(data.serpDataId) : null) ??
    (data.address && latitude != null && longitude != null
      ? await findByNameAddressCoords({
          name: data.name,
          address: data.address,
          latitude,
          longitude,
        })
      : null);

  if (existing) {
    return updatePlace(existing.id, data);
  }

  return createPlace(data);
}
