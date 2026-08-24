// Domain-schema tests for src/domain.ts (Zod validation + invariants).
// Run with: node --experimental-strip-types --test test/domain.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parsePresentation } from "../src/domain.ts";

function base(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "demo",
    title: "Demo",
    theme: {
      ink: "#000000", paper: "#ffffff", muted: "#888888",
      accent: "#0071e3", accent2: "#5e5ce6", accent3: "#ff9f0a", panel: "#ffffff",
    },
    slides: [{ id: "a", type: "title", title: "t1" }],
    ...overrides,
  };
}

test("valid presentation parses successfully", () => {
  const parsed = parsePresentation(base());
  assert.equal(parsed.id, "demo");
  assert.equal(parsed.slides.length, 1);
});

test("non-hex theme color is rejected", () => {
  const bad = base();
  bad.theme.ink = "not-a-color";
  assert.throws(() => parsePresentation(bad), /six-digit hex color/);
});

test("non-positive minDurationSec is rejected", () => {
  const bad = base();
  bad.slides[0].minDurationSec = 0;
  assert.throws(() => parsePresentation(bad), /minDurationSec/);
});

test("invalid slide type is rejected", () => {
  const bad = base();
  bad.slides[0].type = "bogus";
  assert.throws(() => parsePresentation(bad));
});

test("invalid slide id (uppercase) is rejected", () => {
  const bad = base();
  bad.slides[0].id = "Not-Kebab";
  assert.throws(() => parsePresentation(bad), /lowercase|kebab|[a-z0-9-]/);
});

test("duplicate slide ids are rejected by the Domain invariant", () => {
  const bad = base({
    slides: [
      { id: "alpha", type: "title", title: "x" },
      { id: "alpha", type: "text", title: "y" },
    ],
  });
  let captured;
  try {
    parsePresentation(bad);
  } catch (error) {
    captured = error;
  }
  assert.ok(captured, "expected parsePresentation to throw");
  const messages = captured.issues.map((issue) => issue.message);
  assert.ok(
    messages.some((message) => message.includes("duplicate slide id: alpha")),
    `expected duplicate-id message, got ${JSON.stringify(messages)}`,
  );
});

test("invalid audio extension is rejected", () => {
  const bad = base();
  bad.slides[0].audio = "audio/intro.exe";
  assert.throws(() => parsePresentation(bad));
});

test("captions with non-positive endMs are rejected", () => {
  const bad = base();
  bad.slides[0].captions = [
    { text: "hi", startMs: 0, endMs: 0, timestampMs: null, confidence: null },
  ];
  assert.throws(() => parsePresentation(bad));
});

test("presentation has no presenter-specific fields", () => {
  const parsed = parsePresentation(base());
  assert.equal("presenterProfile" in parsed, false);
  assert.equal("showPresenter" in parsed, false);
  assert.equal("presenter" in parsed.slides[0], false);
});
