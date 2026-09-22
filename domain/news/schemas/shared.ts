import { z } from "zod";

export const cuidSchema = z.string().min(1);
export const uuidSchema = z.string().uuid();

export const requestRegionSchema = z.enum(["INDIA", "WORLD", "BOTH"]);
export const regionSchema = z.enum(["INDIA", "WORLD"]);

export const discoveryPeriodSchema = z.enum(["DAY", "WEEK", "MONTH"]);

export type RequestRegionInput = z.infer<typeof requestRegionSchema>;
export type RegionInput = z.infer<typeof regionSchema>;
export type DiscoveryPeriodInput = z.infer<typeof discoveryPeriodSchema>;
