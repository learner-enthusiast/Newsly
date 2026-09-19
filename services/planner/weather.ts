import { z } from "zod";
import { isoDateSchema } from "@/services/AIAgents.ts/planner-intake/schema";

export const weatherDaySchema = z.object({
  date: isoDateSchema.nullable(),
  temperatureMin: z.number().nullable(),
  temperatureMax: z.number().nullable(),
  rainProbability: z.number().min(0).max(100).nullable(),
  condition: z.string().nullable(),
});

export const weatherSnapshotSchema = z.object({
  location: z.string().nullable(),
  fetchedAt: z.string().min(1),
  days: z.array(weatherDaySchema),
});

export type WeatherDay = z.output<typeof weatherDaySchema>;
export type WeatherSnapshot = z.output<typeof weatherSnapshotSchema>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return null;
    }

    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parsePercent(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed == null) {
    return null;
  }

  if (parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = isoDateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function temperaturePair(value: unknown): {
  temperatureMin: number | null;
  temperatureMax: number | null;
} {
  const record = asRecord(value);
  if (record) {
    return {
      temperatureMin: parseNumber(record.low ?? record.min ?? record.temperatureMin),
      temperatureMax: parseNumber(record.high ?? record.max ?? record.temperatureMax),
    };
  }

  const single = parseNumber(value);
  return {
    temperatureMin: single,
    temperatureMax: single,
  };
}

function mapForecastDay(value: unknown, fallbackDate: string | null): WeatherDay {
  const record = asRecord(value) ?? {};
  const temps = temperaturePair(
    record.temperature ?? record.temperatures ?? record.temp,
  );

  return weatherDaySchema.parse({
    date: parseIsoDate(record.date ?? record.datetime) ?? fallbackDate,
    temperatureMin: temps.temperatureMin,
    temperatureMax: temps.temperatureMax,
    rainProbability: parsePercent(
      record.precipitation ??
        record.rain ??
        record.rainProbability ??
        record.chance_of_rain,
    ),
    condition:
      typeof record.weather === "string"
        ? record.weather
        : typeof record.condition === "string"
          ? record.condition
          : typeof record.summary === "string"
            ? record.summary
            : null,
  });
}

/**
 * Deterministic Serp weather → snapshot mapping. Never invents values.
 */
export function mapSerpWeather(
  result: unknown,
  options: { location?: string; date?: string; fetchedAt?: Date } = {},
): WeatherSnapshot {
  const root = asRecord(result) ?? {};
  const answerBox = asRecord(root.answer_box);
  const weatherResults = asRecord(root.weather_results);
  const source = answerBox ?? weatherResults ?? {};
  const fallbackDate = parseIsoDate(options.date);
  const forecast = asArray(source.forecast ?? source.forecasts ?? source.days);
  const location =
    (typeof source.location === "string" && source.location) ||
    options.location ||
    null;

  const days =
    forecast.length > 0
      ? forecast.map((day) => mapForecastDay(day, fallbackDate))
      : [
          mapForecastDay(
            {
              date: source.date ?? fallbackDate,
              temperature: {
                low: source.temperature ?? source.temp,
                high: source.temperature ?? source.temp,
              },
              precipitation: source.precipitation,
              weather: source.weather ?? source.condition,
            },
            fallbackDate,
          ),
        ];

  const meaningfulDays = days.filter(
    (day) =>
      day.date != null ||
      day.temperatureMin != null ||
      day.temperatureMax != null ||
      day.rainProbability != null ||
      day.condition != null,
  );

  return weatherSnapshotSchema.parse({
    location,
    fetchedAt: (options.fetchedAt ?? new Date()).toISOString(),
    days: meaningfulDays,
  });
}

export async function fetchWeatherSnapshot(params: {
  city: string;
  date?: string;
  search: (query: { city: string; date?: string }) => Promise<unknown>;
}) {
  const result = await params.search({
    city: params.city,
    date: params.date,
  });

  return mapSerpWeather(result, {
    location: params.city,
    date: params.date,
  });
}
