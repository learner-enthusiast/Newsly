import { getPlanDaysByPlanId } from "@/repositories/planDay";
import {
  createPlanItem,
  deletePlanItem,
  getNextItemPosition,
  getPlanItemsByDayId,
  movePlanItemToDay,
  reorderPlanItems,
} from "@/repositories/planItem";
import { upsertPlace } from "@/repositories/place";
import {
  mapsPlaceRecords,
  mapsRecordToSerpPlace,
  placeSnapshot,
} from "@/services/planner/canonicalPlace";
import { mapsResultToInternalPlace } from "@/services/planner/normalize/place";
import {
  placeTypeToPlanItemType,
  type PlaceType,
} from "@/services/planner/normalize/placeType";
import { mapsPlacesFromSearch } from "@/services/planner/research/serp";
import {
  serpService,
  type PlaceCategory,
} from "@/services/serpService";
import { requireOwnedPlanDay } from "@/services/plans/planAccess";

function serializeItem(item: Awaited<ReturnType<typeof getPlanItemsByDayId>>[number]) {
  return {
    ...item,
    startTime: item.startTime?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function categoryToPlaceType(category: PlaceCategory): PlaceType {
  switch (category) {
    case "pandal":
      return "pandal";
    case "food":
      return "food";
    case "restaurant":
      return "restaurant";
    case "cafe":
      return "cafe";
    case "parking":
      return "parking";
    case "restroom":
      return "restroom";
    case "atm":
      return "atm";
    case "pharmacy":
      return "pharmacy";
    default:
      return "other";
  }
}

export async function getDayEditorPayload(
  planId: string,
  dayId: string,
  userId: string,
) {
  const day = await requireOwnedPlanDay(planId, dayId, userId);

  if (!day) {
    return null;
  }

  const [items, allDays] = await Promise.all([
    getPlanItemsByDayId(dayId),
    getPlanDaysByPlanId(planId),
  ]);

  return {
    plan: {
      id: day.plan.id,
      city: day.plan.city,
      country: day.plan.country,
      festivalName: day.plan.festivalName,
      title: day.plan.title,
      year: day.plan.year,
    },
    day: {
      id: day.id,
      planId: day.planId,
      dayNumber: day.dayNumber,
      date: day.date?.toISOString() ?? null,
      title: day.title,
      description: day.description,
      startTime: day.startTime?.toISOString() ?? null,
      endTime: day.endTime?.toISOString() ?? null,
    },
    items: items.map(serializeItem),
    otherDays: allDays
      .filter((entry) => entry.id !== dayId)
      .map((entry) => ({
        id: entry.id,
        dayNumber: entry.dayNumber,
        title: entry.title,
      })),
  };
}

export async function saveDayItemOrder(
  planId: string,
  dayId: string,
  userId: string,
  orderedItemIds: string[],
) {
  const day = await requireOwnedPlanDay(planId, dayId, userId);

  if (!day) {
    return null;
  }

  const items = await getPlanItemsByDayId(dayId);
  const validIds = new Set(items.map((item) => item.id));

  if (
    orderedItemIds.length !== items.length ||
    orderedItemIds.some((id) => !validIds.has(id))
  ) {
    throw new Error("Invalid item order");
  }

  if (orderedItemIds.length === 0) {
    return [];
  }

  const updated = await reorderPlanItems(dayId, orderedItemIds);
  return updated.map(serializeItem);
}

export async function removeDayItem(
  planId: string,
  dayId: string,
  itemId: string,
  userId: string,
) {
  const day = await requireOwnedPlanDay(planId, dayId, userId);

  if (!day) {
    return null;
  }

  const items = await getPlanItemsByDayId(dayId);
  const item = items.find((entry) => entry.id === itemId);

  if (!item) {
    return null;
  }

  await deletePlanItem(itemId);

  const remaining = items
    .filter((entry) => entry.id !== itemId)
    .sort((a, b) => a.position - b.position);

  if (remaining.length > 0) {
    await reorderPlanItems(
      dayId,
      remaining.map((entry) => entry.id),
    );
  }

  return { ok: true as const };
}

export async function moveDayItem(
  planId: string,
  dayId: string,
  itemId: string,
  userId: string,
  targetDayId: string,
) {
  const day = await requireOwnedPlanDay(planId, dayId, userId);
  const targetDay = await requireOwnedPlanDay(planId, targetDayId, userId);

  if (!day || !targetDay) {
    return null;
  }

  const items = await getPlanItemsByDayId(dayId);
  const item = items.find((entry) => entry.id === itemId);

  if (!item) {
    return null;
  }

  const targetPosition = await getNextItemPosition(targetDayId);
  await movePlanItemToDay(itemId, targetDayId, targetPosition);

  const remaining = items
    .filter((entry) => entry.id !== itemId)
    .sort((a, b) => a.position - b.position);

  if (remaining.length > 0) {
    await reorderPlanItems(
      dayId,
      remaining.map((entry) => entry.id),
    );
  }

  return { ok: true as const, targetDayId };
}

export async function searchPlacesForDay(params: {
  city: string;
  area?: string;
  category: PlaceCategory;
  query?: string;
  limit?: number;
}) {
  const result = params.query?.trim()
    ? await serpService.discoverNearbyPlaces.fn({
        query: params.query.trim(),
        city: params.city,
        area: params.area,
        limit: params.limit ?? 8,
      })
    : await serpService.discoverPlaces.fn({
        city: params.city,
        area: params.area,
        category: params.category,
        limit: params.limit ?? 8,
      });

  const records = mapsPlaceRecords(mapsPlacesFromSearch(result));

  return records.map((record) => {
    const normalized = serpService.normalizeMapsPlace.fn({
      place_id: record.place_id,
      data_id: record.data_id,
      title: record.title,
      address: record.address,
      gps_coordinates: record.gps_coordinates,
      rating: record.rating,
      reviews: record.reviews,
      description: record.description,
      type: record.type,
      thumbnail: record.thumbnail,
    });

    return {
      externalId: normalized.externalId,
      name: normalized.name,
      address: normalized.address ?? null,
      latitude: normalized.latitude ?? null,
      longitude: normalized.longitude ?? null,
      rating: normalized.rating ?? null,
      reviewCount: normalized.reviewCount ?? null,
      description: normalized.description ?? null,
      type: normalized.type ?? null,
      thumbnail: normalized.thumbnail ?? null,
    };
  });
}

export async function addDayItemFromPlace(
  planId: string,
  dayId: string,
  userId: string,
  input: {
    externalId: string;
    name: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    rating?: number | null;
    reviewCount?: number | null;
    description?: string | null;
    type?: string | null;
    thumbnail?: string | null;
    category: PlaceCategory;
  },
) {
  const day = await requireOwnedPlanDay(planId, dayId, userId);

  if (!day) {
    return null;
  }

  const placeType = categoryToPlaceType(input.category);
  const internal = mapsResultToInternalPlace(
    mapsRecordToSerpPlace({
      title: input.name,
      address: input.address ?? undefined,
      place_id: input.externalId.startsWith("ChI") ? input.externalId : undefined,
      data_id: !input.externalId.startsWith("ChI") ? input.externalId : undefined,
      gps_coordinates:
        input.latitude != null && input.longitude != null
          ? { latitude: input.latitude, longitude: input.longitude }
          : undefined,
      rating: input.rating ?? undefined,
      reviews: input.reviewCount ?? undefined,
      description: input.description ?? undefined,
      type: input.type ?? undefined,
      thumbnail: input.thumbnail ?? undefined,
    }),
    {
      city: day.plan.city,
      discoveryIntent: input.category === "food" ? "food" : "unknown",
    },
  );

  const resolvedType = internal.type ?? placeType;
  const itemType = placeTypeToPlanItemType(resolvedType) ?? "custom";

  const place = await upsertPlace({
    name: internal.name,
    type: resolvedType,
    address: internal.address,
    city: internal.city ?? day.plan.city,
    area: internal.area,
    latitude: internal.latitude,
    longitude: internal.longitude,
    googlePlaceId: internal.googlePlaceId,
    serpDataId: internal.serpDataId,
    rating: internal.rating,
    reviewCount: internal.reviewCount,
    description: internal.description,
    thumbnailUrl: internal.thumbnailUrl,
    hours: internal.hours,
    metadata: internal.metadata,
  });

  const canonical = {
    id: place.id,
    name: place.name,
    type: place.type as PlaceType,
    address: place.address,
    city: place.city,
    area: place.area,
    latitude: place.latitude ? Number(place.latitude) : null,
    longitude: place.longitude ? Number(place.longitude) : null,
    googlePlaceId: place.googlePlaceId,
    serpDataId: place.serpDataId,
    rating: place.rating ? Number(place.rating) : null,
    reviewCount: place.reviewCount,
    description: place.description,
    thumbnailUrl: place.thumbnailUrl,
  };

  const position = await getNextItemPosition(dayId);
  const created = await createPlanItem({
    dayId,
    placeId: place.id,
    type: itemType,
    position,
    notes: `Added from maps search (${input.category}).`,
    snapshot: placeSnapshot(canonical),
  });

  return serializeItem(created);
}
