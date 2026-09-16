import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isAudibleAudio } from "../scripts/media.mjs";

const sample = JSON.parse(fs.readFileSync("example/content/presentation.json", "utf8"));
const sampleManifest = JSON.parse(fs.readFileSync("example/content/audio-manifest.json", "utf8"));

function runValidation(presentation, manifest = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lusine-meta-builder-"));
  const presentationPath = path.join(directory, "presentation.json");
  const manifestPath = path.join(directory, "audio-manifest.json");
  fs.writeFileSync(presentationPath, JSON.stringify(presentation));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const result = spawnSync(process.execPath, [
    "core/scripts/validate-deck.mjs",
    "--presentation",
    presentationPath,
    "--manifest",
    manifestPath,
  ], { encoding: "utf8" });
  fs.rmSync(directory, { recursive: true, force: true });
  return result;
}

test("sample presentation satisfies the external deck contract", () => {
  const result = spawnSync(process.execPath, ["core/scripts/validate-deck.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("sample presentation has a manifest entry for every voiceover", () => {
  const manifestPath = "example/content/audio-manifest.json";
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const voiceovers = sample.slides.filter((slide) => slide.audio);
  assert.equal(voiceovers.length > 0, true);
  for (const slide of voiceovers) {
    assert.equal(manifest[slide.audio]?.path, slide.audio);
    assert.equal(isAudibleAudio({
      durationSec: manifest[slide.audio].durationSec,
      maxDb: manifest[slide.audio].maxDb,
      meanDb: manifest[slide.audio].meanDb,
    }), true);
  }
});

test("silent audio is rejected by the media gate", () => {
  assert.equal(isAudibleAudio({ durationSec: 3, maxDb: -91, meanDb: -91 }), false);
  assert.equal(isAudibleAudio({ durationSec: 3, maxDb: -6, meanDb: -24 }), true);
});

test("validation accepts a presentation supplied outside the example directory", () => {
  const result = runValidation(sample, sampleManifest);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("validation rejects overlapping captions", () => {
  const presentation = structuredClone(sample);
  presentation.slides[0].captions = [
    { text: "first", startMs: 0, endMs: 1500, timestampMs: null, confidence: null },
    { text: "second", startMs: 1200, endMs: 2000, timestampMs: null, confidence: null },
  ];
  const result = runValidation(presentation);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /overlaps/);
});

test("validation rejects captions outside a silent slide duration", () => {
  const presentation = structuredClone(sample);
  const slide = presentation.slides[0];
  delete slide.audio;
  slide.minDurationSec = 6;
  slide.captions = [{ text: "invisible", startMs: 10000, endMs: 20000, timestampMs: null, confidence: null }];
  const result = runValidation(presentation, sampleManifest);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /captions extend beyond the 6s slide duration/);
});

test("schema rejects captions that end before they start", () => {
  const presentation = structuredClone(sample);
  presentation.slides[0].captions = [
    { text: "backwards", startMs: 1000, endMs: 500, timestampMs: null, confidence: null },
  ];
  const result = runValidation(presentation, sampleManifest);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be greater than startMs/);
});
