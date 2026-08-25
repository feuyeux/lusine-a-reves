import fs from "node:fs";
import { loadDeckFiles, getPublicAssetPath, parseArgs, assertConfirmedBrief } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const { presentation, manifest } = loadDeckFiles(args);
const failures = [];
const slideTypes = new Set(["title", "text", "overview", "metrics", "diagram", "quote", "closing", "image"]);
const themeKeys = ["ink", "paper", "muted", "accent", "accent2", "accent3", "panel"];
const hex = /^#[0-9a-fA-F]{6}$/;
// Kept in sync with MAX_STATS / MAX_DIAGRAM_NODES in core/src/domain.ts.
const MAX_STATS = 4;
const MAX_DIAGRAM_NODES = 5;
const imagePattern = /^[a-zA-Z0-9_./-]+\.(png|jpg|jpeg|webp)$/;

if (args.brief) {
  try {
    assertConfirmedBrief(args.brief);
  } catch (error) {
    failures.push(error.message);
  }
}

if (presentation.schemaVersion !== 1) failures.push("schemaVersion must be 1");
if (!/^[a-z0-9-]+$/.test(presentation.id ?? "")) failures.push("id must be lowercase kebab-case");
if (typeof presentation.title !== "string" || !presentation.title.trim()) failures.push("title must be non-empty");
if (!Array.isArray(presentation.slides) || presentation.slides.length === 0) failures.push("slides must be non-empty");
for (const key of themeKeys) {
  if (!hex.test(presentation.theme?.[key] ?? "")) failures.push(`theme.${key} must be a six-digit hex color`);
}

const ids = new Set();
for (const [index, slide] of (presentation.slides ?? []).entries()) {
  if (!/^[a-z0-9-]+$/.test(slide.id ?? "")) failures.push(`slides[${index}].id must be lowercase kebab-case`);
  // Duplicate-id detection is also enforced inside src/domain.ts via a Zod
  // superRefine so every adapter (Remotion/PPTX) sees the same error path.
  // This standalone check stays as a belt-and-suspenders guard so the Node
  // validator works without importing the TypeScript domain module.
  if (ids.has(slide.id)) failures.push(`slides[${index}].id is duplicated: ${slide.id}`);
  ids.add(slide.id);
  if (!slideTypes.has(slide.type)) failures.push(`slides[${index}].type is invalid: ${slide.type}`);
  if (!(Number(slide.minDurationSec) > 0)) failures.push(`slides[${index}].minDurationSec must be positive`);

  // Row layouts in both renderers are bounded by the PPTX canvas width.
  const stats = slide.stats ?? [];
  const nodes = slide.nodes ?? [];
  if (stats.length > MAX_STATS) failures.push(`slides[${index}].stats exceeds ${MAX_STATS} items: ${stats.length}`);
  if (nodes.length > MAX_DIAGRAM_NODES) failures.push(`slides[${index}].nodes exceeds ${MAX_DIAGRAM_NODES} items: ${nodes.length}`);

  // A slide type promises a payload; an empty one renders a blank page.
  if (["overview", "metrics"].includes(slide.type) && stats.length === 0) {
    failures.push(`slides[${index}].stats must have at least one entry for type ${slide.type}`);
  }
  if (slide.type === "diagram" && nodes.length === 0) failures.push(`slides[${index}].nodes must have at least one entry`);
  if (slide.type === "quote" && !(slide.quote ?? slide.body)) failures.push(`slides[${index}] needs quote or body text`);
  if (slide.type === "closing" && !slide.quote) failures.push(`slides[${index}] needs a quote`);

  for (const [statIndex, stat] of stats.entries()) {
    if (stat?.color !== undefined && !hex.test(stat.color)) {
      failures.push(`slides[${index}].stats[${statIndex}].color must be a six-digit hex color`);
    }
  }
  for (const [nodeIndex, node] of nodes.entries()) {
    if (node?.color !== undefined && !hex.test(node.color)) {
      failures.push(`slides[${index}].nodes[${nodeIndex}].color must be a six-digit hex color`);
    }
  }

  // Per-slide palette overrides must stay valid colours on known keys.
  if (slide.themeOverride !== undefined) {
    if (typeof slide.themeOverride !== "object" || slide.themeOverride === null) {
      failures.push(`slides[${index}].themeOverride must be an object`);
    } else {
      for (const [key, value] of Object.entries(slide.themeOverride)) {
        if (!themeKeys.includes(key)) failures.push(`slides[${index}].themeOverride has unknown key: ${key}`);
        else if (!hex.test(value ?? "")) failures.push(`slides[${index}].themeOverride.${key} must be a six-digit hex color`);
      }
    }
  }

  if (slide.type === "image" && !slide.image) failures.push(`slides[${index}].image is required for type image`);
  if (slide.image) {
    if (!imagePattern.test(slide.image.src ?? "")) {
      failures.push(`slides[${index}].image.src must be a png, jpg, jpeg, or webp path: ${slide.image.src}`);
    }
    if (!slide.image.alt || !String(slide.image.alt).trim()) {
      failures.push(`slides[${index}].image.alt is required for accessibility`);
    }
    if (slide.image.fit !== undefined && !["contain", "cover"].includes(slide.image.fit)) {
      failures.push(`slides[${index}].image.fit must be contain or cover`);
    }
    try {
      const assetPath = getPublicAssetPath(slide.image.src, args);
      if (!fs.existsSync(assetPath)) failures.push(`missing image asset: ${assetPath}`);
    } catch {
      failures.push(`slides[${index}].image.src must stay under public/: ${slide.image.src}`);
    }
  }

  if (slide.audio) {
    try {
      const assetPath = getPublicAssetPath(slide.audio, args);
      if (!fs.existsSync(assetPath)) failures.push(`missing audio asset: ${assetPath}`);
    } catch {
      failures.push(`slides[${index}].audio must stay under public/: ${slide.audio}`);
    }
    const entry = manifest[slide.audio];
    if (!entry?.durationSec || entry.path !== slide.audio) failures.push(`audio manifest missing or stale: ${slide.audio}`);
    if (entry && entry.durationSec > 0 && slide.captions?.some((caption) => caption.endMs > entry.durationSec * 1000)) {
      failures.push(`slides[${index}].captions extend beyond audio duration: ${slide.audio}`);
    }
  }
  for (const [captionIndex, caption] of (slide.captions ?? []).entries()) {
    if (!(caption.endMs > caption.startMs)) failures.push(`slides[${index}].captions[${captionIndex}] has invalid range`);
    if (captionIndex > 0 && caption.startMs < slide.captions[captionIndex - 1].endMs) {
      failures.push(`slides[${index}].captions[${captionIndex}] overlaps the previous caption`);
    }
  }
}

for (const [key, entry] of Object.entries(manifest)) {
  if (entry?.path !== key) failures.push(`audio manifest entry path does not match its key: ${key}`);
  if (!(Number(entry?.durationSec) > 0)) failures.push(`audio manifest duration must be positive: ${key}`);
  try {
    if (!fs.existsSync(getPublicAssetPath(key, args))) failures.push(`audio manifest points to missing asset: ${key}`);
  } catch {
    failures.push(`audio manifest path must stay under public/: ${key}`);
  }
}

if (failures.length > 0) {
  console.error("Deck validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Deck valid: ${presentation.id} (${presentation.slides.length} slides).`);
console.log(`Audio entries: ${Object.keys(manifest).length}.`);
