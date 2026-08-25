import { z } from "zod";
import type { Caption } from "@remotion/captions";

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a six-digit hex color");

export const SLIDE_TYPES = [
  "title", "text", "overview", "metrics", "diagram", "quote", "closing", "image",
] as const;

// Layout capacity limits. Both renderers place these items along a single row,
// so the ceiling is set by the narrowest target: the 13.33in PPTX wide canvas.
export const MAX_STATS = 4;
export const MAX_DIAGRAM_NODES = 5;

// Single source of truth for style.density. The video renderer injects these
// as CSS variables and the PPTX exporter scales its type size by `text`, so
// one deck never reads denser in one output than in the other.
export const DENSITY_SCALES = {
  editorial: { gap: 1.18, text: 1.06 },
  information: { gap: 0.82, text: 0.92 },
  balanced: { gap: 1, text: 1 },
  airy: { gap: 1.32, text: 1.1 },
} as const;

// style.motion is a rendering contract, not a label: each mode maps to a
// spring configuration and an entry travel distance.
export const MOTION_CONFIGS = {
  restrained: { damping: 26, stiffness: 70, distance: 10 },
  measured: { damping: 22, stiffness: 90, distance: 16 },
  subtle: { damping: 18, stiffness: 110, distance: 22 },
  energetic: { damping: 12, stiffness: 170, distance: 34 },
} as const;

// Literal tuples so Zod infers exact union types. `satisfies` blocks a key that
// has no scale entry; the "covers every key" direction is asserted in tests.
export const DENSITY_KEYS = ["editorial", "information", "balanced", "airy"] as const satisfies
  readonly (keyof typeof DENSITY_SCALES)[];
export const MOTION_KEYS = ["restrained", "measured", "subtle", "energetic"] as const satisfies
  readonly (keyof typeof MOTION_CONFIGS)[];

// Asset paths stay inside the caller's public/ directory. The scripts enforce
// this too (assertSafeAudioPath), but the schema is the single source of truth
// that every consumer shares, including Remotion Studio which bypasses the
// Node validators.
const assetPath = (pattern: RegExp, message: string) =>
  z.string().regex(pattern, message).refine(
    (value) => !value.split(/[/\\]/).includes("..") && !value.startsWith("/"),
    { message: "must stay under public/ (no .. segments, no leading slash)" },
  );

export const ThemeSchema = z.object({
  ink: Color,
  paper: Color,
  muted: Color,
  accent: Color,
  accent2: Color,
  accent3: Color,
  panel: Color,
});

export const StyleProfileSchema = z.object({
  mood: z.string().min(1).default("clear-explanatory"),
  // Literal tuples keep Zod's type inference precise; `satisfies` guarantees
  // they stay a subset of the scale tables, and a unit test guarantees they
  // cover every key.
  density: z.enum(DENSITY_KEYS).default("balanced"),
  motion: z.enum(MOTION_KEYS).default("subtle"),
  headingFont: z.string().min(1).default("-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"),
  bodyFont: z.string().min(1).default("-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"),
  cornerRadius: z.number().min(0).max(32).default(16),
  backgroundPattern: z.enum(["grid", "none", "rules"]).default("grid"),
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

export const SlideImageSchema = z.object({
  src: assetPath(
    /^[a-zA-Z0-9_./-]+\.(png|jpg|jpeg|webp)$/,
    "must be a png, jpg, jpeg, or webp path relative to public/",
  ),
  // Required so every rendered deck carries an accessible description.
  alt: z.string().min(1),
  caption: z.string().optional(),
  fit: z.enum(["contain", "cover"]).default("contain"),
});

export const SlideSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  type: z.enum(SLIDE_TYPES),
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  bullets: z.array(z.string()).default([]),
  quote: z.string().optional(),
  stats: z.array(StatSchema).max(MAX_STATS).default([]),
  nodes: z.array(DiagramNodeSchema).max(MAX_DIAGRAM_NODES).default([]),
  image: SlideImageSchema.optional(),
  callout: z.string().optional(),
  narration: z.string().min(1).optional(),
  audio: assetPath(
    /^[a-zA-Z0-9_./-]+\.(wav|mp3|m4a)$/,
    "must be a wav, mp3, or m4a path relative to public/",
  ).optional(),
  minDurationSec: z.number().positive().default(6),
  captions: z.array(CaptionSchema).default([]),
  // Per-slide colour overrides let a deck shift palette by chapter without
  // forking the presentation-level theme.
  themeOverride: ThemeSchema.partial().optional(),
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
  theme: ThemeSchema,
  style: StyleProfileSchema.default({
    mood: "clear-explanatory",
    density: "balanced",
    motion: "subtle",
    headingFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif",
    bodyFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif",
    cornerRadius: 16,
    backgroundPattern: "grid",
  }),
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

    // A slide type promises a payload. Without these checks a mistyped deck
    // renders a structurally valid but visually empty page.
    const require = (ok: boolean, field: string, message: string) => {
      if (!ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["slides", index, field], message });
      }
    };
    switch (slide.type) {
      case "overview":
      case "metrics":
        require(slide.stats.length > 0, "stats", `${slide.type} slide needs at least one stat`);
        break;
      case "diagram":
        require(slide.nodes.length > 0, "nodes", "diagram slide needs at least one node");
        break;
      case "image":
        require(slide.image !== undefined, "image", "image slide needs an image");
        break;
      case "quote":
        require(
          Boolean(slide.quote ?? slide.body),
          "quote",
          "quote slide needs quote or body text",
        );
        break;
      case "closing":
        require(Boolean(slide.quote), "quote", "closing slide needs a quote");
        break;
      default:
        break;
    }
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
export type StyleProfile = z.infer<typeof StyleProfileSchema>;
export type SlideImage = z.infer<typeof SlideImageSchema>;
export type AudioManifest = z.infer<typeof AudioManifestSchema>;
export type AudioManifestEntry = z.infer<typeof AudioManifestEntrySchema>;
export type PresentationCaption = Caption;

/** Resolve the effective palette for a slide, applying any per-slide override. */
export function resolveSlideTheme(slide: Slide, theme: Theme): Theme {
  return slide.themeOverride ? { ...theme, ...slide.themeOverride } : theme;
}

export function parsePresentation(input: unknown): Presentation {
  return PresentationSchema.parse(input);
}
