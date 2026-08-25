// CLI contracts: flag validation, help output, single-source style tables, and
// incremental manifest correctness.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KNOWN_FLAGS, parseArgs, usage } from "../scripts/lib.mjs";
import { DENSITY_KEYS, DENSITY_SCALES, MOTION_CONFIGS, MOTION_KEYS } from "../src/domain.ts";

const run = (script, args) => spawnSync(
  process.execPath,
  [path.join("core", "scripts", script), ...args],
  { encoding: "utf8" },
);

test("parseArgs accepts known flags in both spellings", () => {
  assert.deepEqual(parseArgs(["--presentation", "a.json"]), { presentation: "a.json" });
  assert.deepEqual(parseArgs(["--presentation=a.json"]), { presentation: "a.json" });
  assert.deepEqual(parseArgs(["--force"]), { force: true });
});

test("parseArgs rejects an unknown flag instead of ignoring it", () => {
  // Regression guard: a typo used to be stored under a new key, so the script
  // silently fell back to the bundled example.
  assert.throws(() => parseArgs(["--presentaton", "a.json"]), /Unknown flag: --presentaton/);
});

test("parseArgs suggests the closest known flag for a typo", () => {
  assert.throws(() => parseArgs(["--presentaton", "a.json"]), /did you mean --presentation\?/);
  assert.throws(() => parseArgs(["--manifets", "a.json"]), /did you mean --manifest\?/);
});

test("parseArgs accepts extra per-script flags", () => {
  assert.deepEqual(parseArgs(["--only", "x"], { only: "test flag" }), { only: "x" });
  assert.throws(() => parseArgs(["--only", "x"]), /Unknown flag/);
});

test("usage lists every known flag", () => {
  const text = usage("validate-deck.mjs");
  for (const flag of Object.keys(KNOWN_FLAGS)) assert.match(text, new RegExp(`--${flag}`));
});

test("every pipeline script answers --help with exit code 0", () => {
  const scripts = [
    "validate-deck.mjs", "build-audio-manifest.mjs", "export-pptx.mjs",
    "render.mjs", "studio.mjs", "generate-voiceover.mjs",
  ];
  for (const script of scripts) {
    const result = run(script, ["--help"]);
    assert.equal(result.status, 0, `${script}: ${result.stderr}`);
    assert.match(result.stdout, /Usage: node core\/scripts\//, script);
  }
});

test("an unknown flag fails with a readable message and no stack trace", () => {
  const result = run("validate-deck.mjs", ["--turbo"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown flag: --turbo/);
  assert.doesNotMatch(result.stderr, /at \w+ \(/, "should not print a stack trace");
});

test("density and motion tables cover exactly the schema's accepted values", () => {
  // Guards the single-source contract: the enum tuples and the scale tables
  // must not drift apart in either direction.
  assert.deepEqual([...DENSITY_KEYS].sort(), Object.keys(DENSITY_SCALES).sort());
  assert.deepEqual([...MOTION_KEYS].sort(), Object.keys(MOTION_CONFIGS).sort());
});

test("density scales are positive and balanced is the neutral baseline", () => {
  for (const [name, scale] of Object.entries(DENSITY_SCALES)) {
    assert.ok(scale.gap > 0 && scale.text > 0, `${name} must scale positively`);
  }
  assert.deepEqual(DENSITY_SCALES.balanced, { gap: 1, text: 1 });
});

test("the stylesheet no longer carries its own density numbers", () => {
  const css = fs.readFileSync(path.join("core", "src", "styles.css"), "utf8");
  assert.doesNotMatch(css, /\.density-\w+\s*\{[^}]*--gap-scale/, "scale numbers must live in domain.ts only");
});

test("validate-deck reports structural errors without asset noise", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lusine-cli-"));
  const deckPath = path.join(directory, "presentation.json");
  fs.writeFileSync(deckPath, JSON.stringify({
    schemaVersion: 1,
    id: "neg",
    title: "T",
    theme: {
      ink: "#111111", paper: "#ffffff", muted: "#888888",
      accent: "#0071e3", accent2: "#5e5ce6", accent3: "#ff9f0a", panel: "#ffffff",
    },
    // overview without stats is a structural error.
    slides: [{ id: "a", type: "overview", title: "T" }],
  }));
  const result = run("validate-deck.mjs", ["--presentation", deckPath]);
  fs.rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /structure/);
  assert.match(result.stderr, /at least one stat/);
  // The manifest belongs to the example deck, so its entries are irrelevant here.
  assert.doesNotMatch(result.stderr, /manifest points to missing asset/);
});

test("a slide may carry captions without audio", () => {
  // Page length then comes from minDurationSec; captions are timed off frames.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lusine-cli-"));
  const deckPath = path.join(directory, "presentation.json");
  const manifestPath = path.join(directory, "audio-manifest.json");
  fs.writeFileSync(manifestPath, "{}");
  fs.writeFileSync(deckPath, JSON.stringify({
    schemaVersion: 1,
    id: "cap",
    title: "T",
    theme: {
      ink: "#111111", paper: "#ffffff", muted: "#888888",
      accent: "#0071e3", accent2: "#5e5ce6", accent3: "#ff9f0a", panel: "#ffffff",
    },
    slides: [{
      id: "a", type: "title", title: "T", minDurationSec: 5,
      captions: [{ text: "无音频字幕", startMs: 0, endMs: 2000, timestampMs: null, confidence: null }],
    }],
  }));
  const result = run("validate-deck.mjs", ["--presentation", deckPath, "--manifest", manifestPath]);
  fs.rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
});

test("manifest reuses unchanged audio and re-probes changed audio", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lusine-manifest-"));
  const audioDir = path.join(directory, "public", "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  fs.copyFileSync("example/public/audio/opening.wav", path.join(audioDir, "a.wav"));
  fs.copyFileSync("example/public/audio/closing.wav", path.join(audioDir, "b.wav"));
  const deckPath = path.join(directory, "presentation.json");
  const manifestPath = path.join(directory, "audio-manifest.json");
  fs.writeFileSync(deckPath, JSON.stringify({
    schemaVersion: 1,
    id: "inc",
    title: "T",
    theme: {
      ink: "#111111", paper: "#ffffff", muted: "#888888",
      accent: "#0071e3", accent2: "#5e5ce6", accent3: "#ff9f0a", panel: "#ffffff",
    },
    slides: [
      { id: "a", type: "title", title: "A", audio: "audio/a.wav" },
      { id: "b", type: "title", title: "B", audio: "audio/b.wav" },
    ],
  }));
  const build = () => run("build-audio-manifest.mjs", [
    "--presentation", deckPath, "--manifest", manifestPath,
    "--public-dir", path.join(directory, "public"),
  ]);

  assert.match(build().stdout, /2 probed, 0 reused/);
  assert.match(build().stdout, /0 probed, 2 reused/);

  // Changing one file must invalidate only that entry.
  fs.copyFileSync(path.join(audioDir, "b.wav"), path.join(audioDir, "a.wav"));
  assert.match(build().stdout, /1 probed, 1 reused/);

  // A tampered hash must not be trusted.
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest["audio/a.wav"].sha256 = "0".repeat(64);
  manifest["audio/a.wav"].durationSec = 999;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.match(build().stdout, /1 probed, 1 reused/);
  const repaired = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.notEqual(repaired["audio/a.wav"].durationSec, 999);

  // Recorded hashes must match the files on disk.
  for (const [key, entry] of Object.entries(repaired)) {
    const bytes = fs.readFileSync(path.join(directory, "public", key));
    assert.equal(entry.sha256, crypto.createHash("sha256").update(bytes).digest("hex"), key);
  }

  // --force ignores the cache entirely.
  const forced = run("build-audio-manifest.mjs", [
    "--presentation", deckPath, "--manifest", manifestPath,
    "--public-dir", path.join(directory, "public"), "--force",
  ]);
  assert.match(forced.stdout, /2 probed, 0 reused/);

  fs.rmSync(directory, { recursive: true, force: true });
});
