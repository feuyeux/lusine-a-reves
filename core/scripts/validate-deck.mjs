import fs from "node:fs";
import { loadDeckFiles, getPublicAssetPath, parseCliArgs, assertConfirmedBrief } from "./lib.mjs";
import { AudioManifestSchema, PresentationSchema } from "../src/domain.ts";

/*
 * Two-stage validation.
 *
 * Stage 1 delegates every structural rule to the Zod schema in src/domain.ts,
 * so this validator can never drift from what the renderers actually accept.
 * Stage 2 covers what a schema cannot know: whether referenced files exist on
 * disk and whether the audio manifest agrees with the deck.
 *
 * Structural failures short-circuit, because asset checks on a malformed deck
 * produce noise that hides the real cause.
 */
const args = parseCliArgs(process.argv.slice(2), {
  command: "validate-deck.mjs",
  description: "Validate a deck: schema, then on-disk assets and manifest agreement.",
});
const { presentation, manifest } = loadDeckFiles(args);

const fail = (title, messages) => {
  console.error(`${title}:`);
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
};

const briefFailures = [];
if (args.brief) {
  try {
    assertConfirmedBrief(args.brief);
  } catch (error) {
    briefFailures.push(error.message);
  }
}

const formatIssue = (issue) => {
  const location = issue.path.length ? issue.path.join(".") : "<root>";
  return `${location}: ${issue.message}`;
};

const deckResult = PresentationSchema.safeParse(presentation);
const manifestResult = AudioManifestSchema.safeParse(manifest);
const structural = [
  ...briefFailures,
  ...(deckResult.success ? [] : deckResult.error.issues.map((issue) => `presentation.${formatIssue(issue)}`)),
  ...(manifestResult.success ? [] : manifestResult.error.issues.map((issue) => `manifest.${formatIssue(issue)}`)),
];
if (structural.length > 0) fail("Deck validation failed (structure)", structural);

// Parsed data carries schema defaults, so downstream checks never see undefined.
const deck = deckResult.data;
const audioManifest = manifestResult.data;
const failures = [];

for (const [index, slide] of deck.slides.entries()) {
  const where = `slides[${index}] (${slide.id})`;

  if (slide.image) {
    const imagePath = getPublicAssetPath(slide.image.src, args);
    if (!fs.existsSync(imagePath)) failures.push(`${where} missing image asset: ${imagePath}`);
  }

  if (slide.audio) {
    const assetPath = getPublicAssetPath(slide.audio, args);
    if (!fs.existsSync(assetPath)) failures.push(`${where} missing audio asset: ${assetPath}`);
    const entry = audioManifest[slide.audio];
    if (!entry || entry.path !== slide.audio) {
      failures.push(`${where} audio manifest missing or stale: ${slide.audio} (run npm run manifest)`);
    } else if (slide.captions.some((caption) => caption.endMs > entry.durationSec * 1000)) {
      failures.push(`${where} captions extend beyond audio duration: ${slide.audio}`);
    }
  }
  // A slide without audio may still carry captions: page length then comes from
  // minDurationSec and CaptionOverlay times them off the frame counter.

  // Adjacent-caption ordering is a sequence rule, so it lives outside the schema.
  for (const [captionIndex, caption] of slide.captions.entries()) {
    const previous = slide.captions[captionIndex - 1];
    if (captionIndex > 0 && caption.startMs < previous.endMs) {
      failures.push(`${where} captions[${captionIndex}] overlaps the previous caption`);
    }
  }
}

const referenced = new Set(deck.slides.map((slide) => slide.audio).filter(Boolean));
const orphans = [];
for (const key of Object.keys(audioManifest)) {
  // An unused entry is the root cause, so do not also report it as missing.
  if (!referenced.has(key)) {
    orphans.push(key);
  } else if (!fs.existsSync(getPublicAssetPath(key, args))) {
    failures.push(`audio manifest points to missing asset: ${key}`);
  }
}

if (failures.length > 0) fail("Deck validation failed (assets)", failures);

// Sharing one manifest across decks is legitimate, so this only warns.
if (orphans.length > 0) {
  console.warn(`Warning: ${orphans.length} audio manifest entries are unused by this deck:`);
  for (const key of orphans) console.warn(`- ${key}`);
}

console.log(`Deck valid: ${deck.id} (${deck.slides.length} slides).`);
console.log(`Audio entries: ${Object.keys(audioManifest).length}.`);
