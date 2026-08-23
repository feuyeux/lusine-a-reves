import { z } from "zod";
import type { Caption } from "@remotion/captions";

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a six-digit hex color");

export const ThemeSchema = z.object({
  ink: Color,
  paper: Color,
  muted: Color,
  accent: Color,
  accent2: Color,
  accent3: Color,
  panel: Color,
});

export const PresenterProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).default("lina-tech-v1"),
  displayName: z.string().min(1).default("Lina"),
  role: z.string().min(1).default("Technical presenter"),
});

export const CaptionSchema = z.object({
  text: z.string().min(1),
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  timestampMs: z.number().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

const StatSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().optional(),
  color: Color.optional(),
});

const DiagramNodeSchema = z.object({
  label: z.string().min(1),
  sub: z.string().optional(),
  color: Color.optional(),
});

export const SlideSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  type: z.enum(["title", "text", "overview", "metrics", "diagram", "quote", "closing"]),
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  bullets: z.array(z.string()).default([]),
  quote: z.string().optional(),
  stats: z.array(StatSchema).default([]),
  nodes: z.array(DiagramNodeSchema).default([]),
  callout: z.string().optional(),
  narration: z.string().min(1).optional(),
  audio: z.string().regex(/^[a-zA-Z0-9_./-]+\.(wav|mp3|m4a)$/).optional(),
  minDurationSec: z.number().positive().default(6),
  presenter: z.enum(["none", "side", "corner"]).default("side"),
  captions: z.array(CaptionSchema).default([]),
});

export const PresentationSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  fps: z.number().int().min(1).max(120).default(30),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  tailFrames: z.number().int().nonnegative().max(120).default(12),
  showCaptions: z.boolean().default(true),
  showPresenter: z.boolean().default(true),
  presenterProfile: PresenterProfileSchema.default({
    id: "lina-tech-v1",
    displayName: "Lina",
    role: "Technical presenter",
  }),
  theme: ThemeSchema,
  slides: z.array(SlideSchema).min(1),
}).superRefine((value, ctx) => {
  // Domain-level invariant: slide ids must be unique within a presentation.
  // Caught here so every adapter (Remotion, PPTX, validate-deck, CLI) sees
  // the same error path, not a duplicated check in each consumer.
  const seen = new Set<string>();
  for (const [index, slide] of value.slides.entries()) {
    if (seen.has(slide.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slides", index, "id"],
        message: `duplicate slide id: ${slide.id}`,
      });
    }
    seen.add(slide.id);
  }
});

export const AudioManifestEntrySchema = z.object({
  path: z.string(),
  durationSec: z.number().positive(),
  sampleRate: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  sha256: z.string().length(64).optional(),
  maxDb: z.number().finite().optional(),
  meanDb: z.number().finite().optional(),
});

export const AudioManifestSchema = z.record(z.string(), AudioManifestEntrySchema);

export type Presentation = z.infer<typeof PresentationSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type PresenterProfile = z.infer<typeof PresenterProfileSchema>;
export type AudioManifest = z.infer<typeof AudioManifestSchema>;
export type AudioManifestEntry = z.infer<typeof AudioManifestEntrySchema>;
export type PresentationCaption = Caption;

export function parsePresentation(input: unknown): Presentation {
  return PresentationSchema.parse(input);
}
