// Timeline tests for src/timeline.ts.
// Run with: node --experimental-strip-types --test test/timeline.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, getSlideDurationInFrames } from "../src/timeline.ts";
import { parsePresentation } from "../src/domain.ts";

const fps = 30;
const tailFrames = 12;

function makePresentation(slides) {
  return parsePresentation({
    schemaVersion: 1,
    id: "demo",
    title: "Demo",
    theme: {
      ink: "#000000",
      paper: "#ffffff",
      muted: "#888888",
      accent: "#54d6c5",
      accent2: "#7da8ff",
      accent3: "#ffbf78",
      panel: "#132238",
    },
    fps,
    tailFrames,
    slides,
  });
}

test("slide with audio uses audio.durationSec * fps + tailFrames", () => {
  const slide = { id: "a", type: "title", title: "t", audio: "audio/a.wav", minDurationSec: 1 };
  const manifest = { "audio/a.wav": { path: "audio/a.wav", durationSec: 5 } };
  const presentation = makePresentation([slide]);
  const frames = getSlideDurationInFrames(slide, presentation, manifest);
  // 5s * 30fps + 12 tail = 162 frames; min(1s * 30 = 30, 162) → 162
  assert.equal(frames, Math.ceil(5 * fps + tailFrames));
});

test("slide without audio falls back to minDurationSec * fps", () => {
  const slide = { id: "a", type: "title", title: "t", minDurationSec: 4 };
  const presentation = makePresentation([slide]);
  const frames = getSlideDurationInFrames(slide, presentation, {});
  assert.equal(frames, Math.ceil(4 * fps));
});

test("minDurationSec wins when it is longer than audio duration", () => {
  const slide = { id: "a", type: "title", title: "t", audio: "audio/a.wav", minDurationSec: 10 };
  const manifest = { "audio/a.wav": { path: "audio/a.wav", durationSec: 3 } };
  const presentation = makePresentation([slide]);
  const frames = getSlideDurationInFrames(slide, presentation, manifest);
  // 10s * 30fps = 300 frames beats 3s * 30fps + 12 = 102
  assert.equal(frames, Math.ceil(10 * fps));
});

test("timeline concatenates startFrame offsets and reports totalFrames", () => {
  const slides = [
    { id: "a", type: "title", title: "t1", audio: "audio/a.wav", minDurationSec: 2 },
    { id: "b", type: "text", title: "t2", minDurationSec: 2 },
  ];
  const manifest = { "audio/a.wav": { path: "audio/a.wav", durationSec: 2 } };
  const presentation = makePresentation(slides);
  const timeline = buildTimeline(presentation, manifest);
  const aFrames = Math.ceil(2 * fps + tailFrames);
  const bFrames = Math.ceil(2 * fps);
  assert.equal(timeline.slides[0].startFrame, 0);
  assert.equal(timeline.slides[0].durationInFrames, aFrames);
  assert.equal(timeline.slides[1].startFrame, aFrames);
  assert.equal(timeline.slides[1].durationInFrames, bFrames);
  assert.equal(timeline.totalFrames, aFrames + bFrames);
});

test("zero-duration audio still produces at least one frame", () => {
  const slide = { id: "a", type: "title", title: "t", audio: "audio/a.wav", minDurationSec: 0.01 };
  const manifest = { "audio/a.wav": { path: "audio/a.wav", durationSec: 0 } };
  const presentation = makePresentation([slide]);
  const frames = getSlideDurationInFrames(slide, presentation, manifest);
  assert.ok(frames >= 1, `expected >=1 frame, got ${frames}`);
});