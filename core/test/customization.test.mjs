// Customization contracts: image slides, per-slide theme overrides, layout
// capacity limits, type/payload consistency, and asset path safety.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_STATS,
  MAX_DIAGRAM_NODES,
  SLIDE_TYPES,
  parsePresentation,
  resolveSlideTheme,
} from "../src/domain.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function base(slides) {
  return {
    schemaVersion: 1,
    id: "demo",
    title: "Demo",
    theme: {
      ink: "#000000", paper: "#ffffff", muted: "#888888",
      accent: "#0071e3", accent2: "#5e5ce6", accent3: "#ff9f0a", panel: "#ffffff",
    },
    slides,
  };
}

const stats = (count) => Array.from({ length: count }, (_, i) => ({ value: `${i}`, label: `l${i}` }));
const nodes = (count) => Array.from({ length: count }, (_, i) => ({ label: `n${i}` }));

test("image is an accepted slide type", () => {
  assert.ok(SLIDE_TYPES.includes("image"));
});

test("image slide accepts a public-relative asset and requires alt text", () => {
  const parsed = parsePresentation(base([
    { id: "a", type: "image", title: "t", image: { src: "images/shot.png", alt: "描述" } },
  ]));
  assert.equal(parsed.slides[0].image.src, "images/shot.png");
  // fit defaults to contain so aspect ratio is preserved unless asked otherwise.
  assert.equal(parsed.slides[0].image.fit, "contain");
});

test("image slide without an image is rejected", () => {
  assert.throws(
    () => parsePresentation(base([{ id: "a", type: "image", title: "t" }])),
    /image slide needs an image/,
  );
});

test("image without alt text is rejected", () => {
  assert.throws(
    () => parsePresentation(base([
      { id: "a", type: "image", title: "t", image: { src: "images/shot.png", alt: "" } },
    ])),
    /alt/i,
  );
});

test("image with an unsupported extension is rejected", () => {
  assert.throws(
    () => parsePresentation(base([
      { id: "a", type: "image", title: "t", image: { src: "images/shot.bmp", alt: "x" } },
    ])),
    /png, jpg, jpeg, or webp/,
  );
});

test("asset paths cannot traverse outside public/", () => {
  for (const src of ["../secrets/shot.png", "/etc/shot.png"]) {
    assert.throws(
      () => parsePresentation(base([
        { id: "a", type: "image", title: "t", image: { src, alt: "x" } },
      ])),
      /public\//,
      `expected ${src} to be rejected`,
    );
  }
});

test("audio paths cannot traverse outside public/", () => {
  assert.throws(
    () => parsePresentation(base([
      { id: "a", type: "title", title: "t", audio: "../../escape.wav" },
    ])),
    /public\//,
  );
});

test("stats are capped at the row capacity", () => {
  assert.doesNotThrow(() => parsePresentation(base([
    { id: "a", type: "overview", title: "t", stats: stats(MAX_STATS) },
  ])));
  assert.throws(
    () => parsePresentation(base([
      { id: "a", type: "overview", title: "t", stats: stats(MAX_STATS + 1) },
    ])),
    /Too big|at most|less than or equal/i,
  );
});

test("diagram nodes are capped at the row capacity", () => {
  assert.doesNotThrow(() => parsePresentation(base([
    { id: "a", type: "diagram", title: "t", nodes: nodes(MAX_DIAGRAM_NODES) },
  ])));
  assert.throws(
    () => parsePresentation(base([
      { id: "a", type: "diagram", title: "t", nodes: nodes(MAX_DIAGRAM_NODES + 1) },
    ])),
    /Too big|at most|less than or equal/i,
  );
});

test("a slide type must carry its payload", () => {
  const cases = [
    [{ id: "a", type: "overview", title: "t" }, /at least one stat/],
    [{ id: "a", type: "metrics", title: "t" }, /at least one stat/],
    [{ id: "a", type: "diagram", title: "t" }, /at least one node/],
    [{ id: "a", type: "quote", title: "t" }, /quote or body/],
    [{ id: "a", type: "closing", title: "t" }, /needs a quote/],
  ];
  for (const [slide, pattern] of cases) {
    assert.throws(() => parsePresentation(base([slide])), pattern, `expected ${slide.type} to require a payload`);
  }
});

test("themeOverride merges over the deck palette for one slide only", () => {
  const parsed = parsePresentation(base([
    { id: "a", type: "title", title: "t", themeOverride: { paper: "#101010" } },
    { id: "b", type: "title", title: "t2" },
  ]));
  const overridden = resolveSlideTheme(parsed.slides[0], parsed.theme);
  const untouched = resolveSlideTheme(parsed.slides[1], parsed.theme);
  assert.equal(overridden.paper, "#101010");
  // Unspecified keys still come from the deck theme.
  assert.equal(overridden.ink, "#000000");
  assert.equal(untouched.paper, "#ffffff");
});

test("themeOverride rejects a non-hex colour", () => {
  assert.throws(
    () => parsePresentation(base([
      { id: "a", type: "title", title: "t", themeOverride: { paper: "white" } },
    ])),
    /six-digit hex color/,
  );
});

test("brand and locale have generic defaults and accept caller values", () => {
  const defaults = parsePresentation(base([{ id: "a", type: "title", title: "t" }]));
  assert.equal(defaults.brand, "Presentation Builder");
  assert.equal(defaults.locale, "en-US");
  const custom = parsePresentation({
    ...base([{ id: "a", type: "title", title: "t" }]),
    brand: "Acme Research",
    locale: "fr-FR",
  });
  assert.equal(custom.brand, "Acme Research");
  assert.equal(custom.locale, "fr-FR");
});

test("style density and motion survive parsing with defaults", () => {
  const parsed = parsePresentation(base([{ id: "a", type: "title", title: "t" }]));
  assert.equal(parsed.style.density, "balanced");
  assert.equal(parsed.style.motion, "subtle");
  const custom = parsePresentation({
    ...base([{ id: "a", type: "title", title: "t" }]),
    style: { density: "information", motion: "energetic" },
  });
  assert.equal(custom.style.density, "information");
  assert.equal(custom.style.motion, "energetic");
});

test("stylesheet resolves every colour through theme variables", () => {
  const css = fs.readFileSync(path.join(root, "core", "src", "styles.css"), "utf8");
  const offenders = [];
  for (const [index, line] of css.split("\n").entries()) {
    // Variable fallbacks (var(--x, #hex)) and mask-image alpha stops are the
    // only permitted literals; anything else would bypass the deck theme.
    const stripped = line.replace(/var\(--[a-z-]+,\s*#[0-9a-fA-F]{3,6}\)/g, "").replace(/mask-image:[^;]+;/g, "");
    if (/#[0-9a-fA-F]{3,6}|rgba?\(\s*\d/.test(stripped)) offenders.push(`${index + 1}: ${line.trim()}`);
  }
  assert.deepEqual(offenders, [], `hard-coded colours bypass the theme:\n${offenders.join("\n")}`);
});

test("every theme preset provides a complete palette", () => {
  const dir = path.join(root, "core", "profiles");
  const presets = fs.readdirSync(dir).filter((name) => name.startsWith("theme.") && name.endsWith(".json"));
  assert.ok(presets.length > 0, "expected at least one theme preset");
  for (const name of presets) {
    const preset = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    assert.equal(preset.schemaVersion, 1, `${name} schemaVersion`);
    // A preset must drop straight into a deck, so validate it as a real theme.
    assert.doesNotThrow(
      () => parsePresentation({ ...base([{ id: "a", type: "title", title: "t" }]), theme: preset.theme }),
      `${name} must be a valid theme`,
    );
  }
});
