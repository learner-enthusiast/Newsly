import { factSheetSchema } from "@/Agents/video/researchBuilder/schema";
import { scriptOutputSchema } from "@/Agents/video/scriptWriter/schema";
import { z } from "zod";

export const OVERLAY_TYPES = ["none", "image", "logo", "chart", "text_card", "video_broll", "map"] as const;
export type OverlayType = (typeof OVERLAY_TYPES)[number];

/** Overlay types that are filled by searching for media. */
export const SEARCHABLE_OVERLAYS: ReadonlySet<OverlayType> = new Set(["image", "logo", "video_broll"]);

export const creativeDirectorInputSchema = z.object({
  script: scriptOutputSchema,
  factSheet: factSheetSchema,
  aspectRatio: z.enum(["9:16", "16:9"]),
  language: z.enum(["hi", "en"]),
});

export type CreativeDirectorInput = z.input<typeof creativeDirectorInputSchema>;

export const editingSchema = z.object({
  transitionIn: z.string().min(1),
  transitionOut: z.string().min(1),
  motion: z.string().min(1),
  textAnimation: z.string().optional(),
  speakerFraming: z.enum(["normal", "punch-in 115%"]),
  sfx: z.string().optional(),
  musicCue: z.string().optional(),
});

export const beatDirectionSchema = z.object({
  index: z.number().int().min(0),
  needsVisual: z.boolean(),
  overlayType: z.enum(OVERLAY_TYPES),
  /** ≤ 3; only for image / logo / video_broll. */
  searchQueries: z.array(z.string()).max(3),
  /** Director would rather generate this visual than use a found one. */
  preferGenerative: z.boolean(),
  editing: editingSchema,
  editorNote: z.string().min(1),
});

export const globalDirectionSchema = z.object({
  pacing: z.string().min(1),
  hookTreatment: z.string().min(1),
  subtitleStyle: z.string().min(1),
  colorTreatment: z.string().min(1),
  musicMood: z.string().min(1),
});

export const creativeDirectionSchema = z.object({
  beats: z.array(beatDirectionSchema).min(1),
  global: globalDirectionSchema,
});

export type BeatDirection = z.infer<typeof beatDirectionSchema>;
export type CreativeDirection = z.infer<typeof creativeDirectionSchema>;

/** LLM output (strict-mode friendly). */
export const directionDraftSchema = z.object({
  beats: z.array(
    z.object({
      index: z.number().int(),
      overlayType: z.enum(OVERLAY_TYPES),
      searchQueries: z.array(z.string()).max(3),
      preferGenerative: z.boolean(),
      editing: z.object({
        transitionIn: z.string(),
        transitionOut: z.string(),
        motion: z.string(),
        textAnimation: z.string().nullable(),
        speakerFraming: z.enum(["normal", "punch-in 115%"]),
        sfx: z.string().nullable(),
        musicCue: z.string().nullable(),
      }),
      editorNote: z.string(),
    }),
  ),
  global: z.object({
    pacing: z.string(),
    hookTreatment: z.string(),
    subtitleStyle: z.string(),
    colorTreatment: z.string(),
    musicMood: z.string(),
  }),
});

export type DirectionDraft = z.infer<typeof directionDraftSchema>;
