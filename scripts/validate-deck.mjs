import fs from "node:fs";
import { loadDeckFiles, getAudioAssetPath, parseArgs } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const { presentation, manifest } = loadDeckFiles(args);
const failures = [];
const slideTypes = new Set(["title", "text", "overview", "metrics", "diagram", "quote", "closing"]);
const hex = /^#[0-9a-fA-F]{6}$/;

if (presentation.schemaVersion !== 1) failures.push("schemaVersion must be 1");
if (!/^[a-z0-9-]+$/.test(presentation.id ?? "")) failures.push("id must be lowercase kebab-case");
if (typeof presentation.title !== "string" || !presentation.title.trim()) failures.push("title must be non-empty");
if (presentation.presenterProfile && !/^[a-z0-9-]+$/.test(presentation.presenterProfile.id ?? "")) failures.push("presenterProfile.id must be lowercase kebab-case");
if (!Array.isArray(presentation.slides) || presentation.slides.length === 0) failures.push("slides must be non-empty");
for (const key of ["ink", "paper", "muted", "accent", "accent2", "accent3", "panel"]) {
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
  if (slide.audio) {
    try {
      const assetPath = getAudioAssetPath(slide.audio);
      if (!fs.existsSync(assetPath)) failures.push(`missing audio asset: public/${slide.audio}`);
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
    if (!fs.existsSync(getAudioAssetPath(key))) failures.push(`audio manifest points to missing asset: public/${key}`);
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
