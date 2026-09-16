import fs from "node:fs";
import path from "node:path";
import pptxgen from "pptxgenjs";
import { spawnSync } from "node:child_process";
import { getOutputDir, getPublicAssetPath, loadDeckFiles, parseCliArgs, root } from "./lib.mjs";
import { DENSITY_SCALES } from "../src/domain.ts";

const args = parseCliArgs(process.argv.slice(2), {
  command: "export-pptx.mjs",
  description: "Export the deck to an editable PPTX file.",
});
const { presentation } = loadDeckFiles(args);
const validation = spawnSync(process.execPath, [path.join(root, "core", "scripts", "validate-deck.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
if (validation.status !== 0) process.exit(validation.status ?? 1);
const outputDir = getOutputDir(args);
fs.mkdirSync(outputDir, { recursive: true });

// LAYOUT_WIDE is 13.333in x 7.5in. Keeping the usable width in one constant
// lets the stat/node rows scale with item count instead of overflowing.
const CANVAS_WIDTH_IN = 13.333;
const MARGIN_IN = 0.55;
const CONTENT_WIDTH_IN = CANVAS_WIDTH_IN - MARGIN_IN * 2;
const BODY_COLUMN_GAP_IN = 0.35;
const BODY_COLUMN_WIDTH_IN = (CONTENT_WIDTH_IN - BODY_COLUMN_GAP_IN) / 2;

const style = presentation.style ?? {};
// Density affects PPTX type size the same way it affects the video renderer.
// The scale table lives in src/domain.ts so both outputs share one source.
const TEXT_SCALE = (DENSITY_SCALES[style.density ?? "balanced"] ?? DENSITY_SCALES.balanced).text;
const fz = (size) => Math.round(size * TEXT_SCALE * 10) / 10;

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = presentation.author ?? presentation.brand;
pptx.subject = presentation.title;
pptx.title = presentation.title;
pptx.company = presentation.brand;
// Surface the semantic mood so it survives into the delivered artefact.
if (style.mood) pptx.category = style.mood;
pptx.lang = presentation.locale;

const c = (value) => value.replace(/^#/, "");
const headingFont = style.headingFont?.split(",")[0]?.replaceAll("'", "").replaceAll('"', "").trim() || "Aptos Display";
const bodyFont = style.bodyFont?.split(",")[0]?.replaceAll("'", "").replaceAll('"', "").trim() || "Aptos";
pptx.theme = { headFontFace: headingFont, bodyFontFace: bodyFont, lang: presentation.locale };

// Theme semantics match the video renderer exactly: `paper` is the background,
// `ink` is the foreground. Per-slide themeOverride is applied on top.
const themeFor = (item) => ({ ...presentation.theme, ...(item.themeOverride ?? {}) });

const addHeader = (slide, item, index, theme) => {
  slide.addText(presentation.brand, { x: MARGIN_IN, y: 0.35, w: 3, h: 0.25, fontFace: bodyFont, fontSize: fz(8), bold: true, charSpacing: 2, color: c(theme.muted), margin: 0, fit: "shrink" });
  slide.addText(`${String(index + 1).padStart(2, "0")} / ${String(presentation.slides.length).padStart(2, "0")}   ${item.eyebrow ?? item.type.toUpperCase()}`, { x: MARGIN_IN, y: 0.75, w: 8, h: 0.25, fontSize: fz(8), bold: true, charSpacing: 1.2, color: c(theme.accent2), margin: 0 });
  slide.addText(item.title, { x: MARGIN_IN, y: 1.08, w: CONTENT_WIDTH_IN, h: 0.72, fontFace: headingFont, fontSize: fz(28), bold: true, color: c(theme.ink), margin: 0, breakLine: false, fit: "shrink" });
  if (item.subtitle) slide.addText(item.subtitle, { x: MARGIN_IN, y: 1.9, w: 10, h: 0.4, fontSize: fz(12), color: c(theme.muted), margin: 0, fit: "shrink" });
};

const addStats = (slide, item, theme) => {
  const count = item.stats.length;
  const gap = 0.3;
  const cardWidth = (CONTENT_WIDTH_IN - gap * (count - 1)) / count;
  item.stats.forEach((stat, index) => {
    const x = MARGIN_IN + index * (cardWidth + gap);
    const inner = cardWidth - 0.4;
    slide.addShape(pptx.ShapeType.rect, { x, y: 3.0, w: cardWidth, h: 2.5, fill: { color: c(theme.panel), transparency: 8 }, line: { color: c(stat.color ?? theme.accent), transparency: 65, width: 1 } });
    slide.addText(stat.value, { x: x + 0.2, y: 3.28, w: inner, h: 0.65, fontSize: fz(32), bold: true, color: c(stat.color ?? theme.accent), margin: 0, fit: "shrink" });
    slide.addText(stat.label, { x: x + 0.2, y: 4.25, w: inner, h: 0.35, fontSize: fz(13), bold: true, color: c(theme.ink), margin: 0, fit: "shrink" });
    if (stat.detail) slide.addText(stat.detail, { x: x + 0.2, y: 4.72, w: inner, h: 0.3, fontSize: fz(9), color: c(theme.muted), margin: 0, fit: "shrink" });
  });
};

const addNodes = (slide, item, theme) => {
  const count = item.nodes.length;
  const arrowWidth = 0.45;
  const nodeWidth = (CONTENT_WIDTH_IN - arrowWidth * (count - 1)) / count;
  item.nodes.forEach((node, index) => {
    const x = MARGIN_IN + index * (nodeWidth + arrowWidth);
    const inner = nodeWidth - 0.3;
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 3.65, w: nodeWidth, h: 1.25, fill: { color: c(theme.panel) }, line: { color: c(node.color ?? theme.accent), width: 1 } });
    slide.addText(node.label, { x: x + 0.15, y: 3.9, w: inner, h: 0.25, fontSize: fz(13), bold: true, color: c(node.color ?? theme.accent), margin: 0, align: "center" });
    if (node.sub) slide.addText(node.sub, { x: x + 0.15, y: 4.35, w: inner, h: 0.2, fontSize: fz(8), color: c(theme.muted), margin: 0, align: "center" });
    if (index < count - 1) slide.addText("→", { x: x + nodeWidth, y: 4.0, w: arrowWidth, h: 0.3, fontSize: fz(20), color: c(theme.muted), margin: 0, align: "center" });
  });
};

const addImage = (slide, item, theme) => {
  const imagePath = getPublicAssetPath(item.image.src, args);
  if (!fs.existsSync(imagePath)) throw new Error(`Missing image asset: ${imagePath}`);
  // `sizing.contain` preserves aspect ratio; `cover` crops to fill the frame.
  const frame = { x: MARGIN_IN, y: 2.5, w: CONTENT_WIDTH_IN, h: 3.6 };
  slide.addImage({
    path: imagePath,
    ...frame,
    sizing: { type: item.image.fit === "cover" ? "cover" : "contain", w: frame.w, h: frame.h },
    altText: item.image.alt,
  });
  if (item.image.caption) {
    slide.addText(item.image.caption, { x: MARGIN_IN, y: 6.2, w: CONTENT_WIDTH_IN, h: 0.35, fontSize: fz(10), color: c(theme.muted), margin: 0, align: "center", fit: "shrink" });
  }
};

const addBody = (slide, item, theme) => {
  if (["overview", "metrics"].includes(item.type)) addStats(slide, item, theme);
  else if (item.type === "diagram") addNodes(slide, item, theme);
  else if (item.type === "image") addImage(slide, item, theme);
  else if (item.type === "quote" || item.type === "closing") {
    slide.addText(item.quote ?? item.body ?? "", { x: MARGIN_IN, y: 3.35, w: CONTENT_WIDTH_IN, h: 1.4, fontSize: fz(25), bold: true, color: c(theme.accent3), margin: 0, fit: "shrink" });
  } else {
    if (item.body) slide.addText(item.body, { x: MARGIN_IN, y: 3.1, w: BODY_COLUMN_WIDTH_IN, h: 2.0, fontSize: fz(16), color: c(theme.ink), margin: 0.05, breakLine: false, fit: "shrink" });
    if (item.bullets?.length) slide.addText(item.bullets.map((bullet) => ({ text: bullet, options: { bullet: { indent: 12 }, hanging: 3 } })), { x: MARGIN_IN + BODY_COLUMN_WIDTH_IN + BODY_COLUMN_GAP_IN, y: 3.1, w: BODY_COLUMN_WIDTH_IN, h: 2.3, fontSize: fz(13), color: c(theme.ink), breakLine: false, margin: 0.08, valign: "mid", fit: "shrink" });
  }
  // Callouts sit below the image caption band, so image slides skip them here.
  if (item.callout && item.type !== "image") {
    slide.addText(item.callout, { x: MARGIN_IN, y: 6.2, w: CONTENT_WIDTH_IN, h: 0.45, fontSize: fz(12), color: c(theme.ink), fill: { color: c(theme.accent), transparency: 88 }, margin: 0.12, fit: "shrink" });
  }
};

presentation.slides.forEach((item, index) => {
  const theme = themeFor(item);
  const slide = pptx.addSlide();
  slide.background = { color: c(theme.paper) };
  addHeader(slide, item, index, theme);
  addBody(slide, item, theme);
  slide.addText(`${presentation.title}  ·  ${item.id}`, { x: MARGIN_IN, y: 7.05, w: 10, h: 0.18, fontSize: fz(7), color: c(theme.muted), margin: 0, charSpacing: 1 });
});

const outputPath = path.join(outputDir, `${presentation.id}.pptx`);
await pptx.writeFile({ fileName: outputPath });
console.log(`PPTX written: ${outputPath}`);
