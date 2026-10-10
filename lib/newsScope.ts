import { z } from "zod";

export const newsScopeSchema = z.enum(["local", "world", "both"]);

export type NewsScope = z.infer<typeof newsScopeSchema>;
