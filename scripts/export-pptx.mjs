import fs from "node:fs";
import path from "node:path";
import pptxgen from "pptxgenjs";
import { spawnSync } from "node:child_process";
import { getOutputDir, loadDeckFiles, parseArgs, root } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const { presentation } = loadDeckFiles(args);
const validation = spawnSync(process.execPath, [path.join(root, "scripts", "validate-deck.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
if (validation.status !== 0) process.exit(validation.status ?? 1);
const outputDir = getOutputDir(args);
fs.mkdirSync(outputDir, { recursive: true });
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = presentation.author ?? "Lusine a Reves Meta Builder";
pptx.subject = presentation.title;
pptx.title = presentation.title;
pptx.company = "Lusine a Reves Meta Builder";
pptx.lang = "zh-CN";
pptx.theme = { headFontFace: "Aptos Display", bodyFontFace: "Aptos", lang: "zh-CN" };

const c = (value) => value.replace(/^#/, "");
const addHeader = (slide, item, index) => {
  slide.addText("LUSINE / META BUILDER", { x: 0.55, y: 0.35, w: 3, h: 0.25, fontFace: "Aptos", fontSize: 8, bold: true, charSpacing: 2, color: c(presentation.theme.muted), margin: 0 });
  slide.addText(`${String(index + 1).padStart(2, "0")} / ${String(presentation.slides.length).padStart(2, "0")}   ${item.eyebrow ?? item.type.toUpperCase()}`, { x: 0.55, y: 0.75, w: 8, h: 0.25, fontSize: 8, bold: true, charSpacing: 1.2, color: c(presentation.theme.accent2), margin: 0 });
  slide.addText(item.title, { x: 0.55, y: 1.08, w: 11.4, h: 0.72, fontSize: 28, bold: true, color: c(presentation.theme.paper), margin: 0, breakLine: false, fit: "shrink" });
  if (item.subtitle) slide.addText(item.subtitle, { x: 0.55, y: 1.9, w: 10, h: 0.4, fontSize: 12, color: c(presentation.theme.muted), margin: 0, fit: "shrink" });
};
const addPresenter = (slide, item) => {
  if (!presentation.showPresenter || item.presenter === "none") return;
  slide.addShape(pptx.ShapeType.roundRect, { x: 9.45, y: 3.0, w: 2.35, h: 3.05, rectRadius: 0.08, fill: { color: c(presentation.theme.panel), transparency: 5 }, line: { color: c(presentation.theme.accent), transparency: 30 } });
  slide.addText(`${presentation.presenterProfile?.displayName ?? "Lina"} / PRESENTER`, { x: 9.7, y: 3.2, w: 1.8, h: 0.2, fontSize: 7, bold: true, charSpacing: 1.2, color: c(presentation.theme.muted), margin: 0, fit: "shrink" });
  slide.addShape(pptx.ShapeType.ellipse, { x: 10.05, y: 3.7, w: 1.1, h: 1.1, fill: { color: "D99B7C" }, line: { color: "D99B7C" } });
  slide.addShape(pptx.ShapeType.arc, { x: 9.95, y: 3.45, w: 1.3, h: 0.65, adjustPoint: 0.2, line: { color: "18263E", width: 16 } });
  slide.addShape(pptx.ShapeType.chevron, { x: 9.92, y: 4.78, w: 1.35, h: 1.02, fill: { color: c(presentation.theme.accent) }, line: { color: c(presentation.theme.accent) } });
};
const addStats = (slide, item) => item.stats.forEach((stat, index) => {
  const x = 0.55 + index * 2.85;
  slide.addShape(pptx.ShapeType.rect, { x, y: 3.0, w: 2.55, h: 2.5, fill: { color: c(presentation.theme.panel), transparency: 8 }, line: { color: c(stat.color ?? presentation.theme.accent), transparency: 65, width: 1 } });
  slide.addText(stat.value, { x: x + 0.2, y: 3.28, w: 2.1, h: 0.65, fontSize: 32, bold: true, color: c(stat.color ?? presentation.theme.accent), margin: 0, fit: "shrink" });
  slide.addText(stat.label, { x: x + 0.2, y: 4.25, w: 2.1, h: 0.35, fontSize: 13, bold: true, color: c(presentation.theme.paper), margin: 0, fit: "shrink" });
  if (stat.detail) slide.addText(stat.detail, { x: x + 0.2, y: 4.72, w: 2.1, h: 0.3, fontSize: 9, color: c(presentation.theme.muted), margin: 0, fit: "shrink" });
});
const addBody = (slide, item) => {
  if (["overview", "metrics"].includes(item.type)) addStats(slide, item);
  else if (item.type === "diagram") {
    item.nodes.forEach((node, index) => {
      const x = 0.75 + index * 2.7;
      slide.addShape(pptx.ShapeType.roundRect, { x, y: 3.65, w: 2.1, h: 1.25, fill: { color: c(presentation.theme.panel) }, line: { color: c(node.color ?? presentation.theme.accent), width: 1 } });
      slide.addText(node.label, { x: x + 0.15, y: 3.9, w: 1.8, h: 0.25, fontSize: 13, bold: true, color: c(node.color ?? presentation.theme.accent), margin: 0, align: "center" });
      if (node.sub) slide.addText(node.sub, { x: x + 0.15, y: 4.35, w: 1.8, h: 0.2, fontSize: 8, color: c(presentation.theme.muted), margin: 0, align: "center" });
      if (index < item.nodes.length - 1) slide.addText("→", { x: x + 2.1, y: 4.0, w: 0.55, h: 0.3, fontSize: 20, color: c(presentation.theme.muted), margin: 0, align: "center" });
    });
  } else if (item.type === "quote" || item.type === "closing") {
    slide.addText(item.quote ?? item.body ?? "", { x: 0.75, y: 3.35, w: 8.2, h: 1.4, fontSize: 25, bold: true, color: c(presentation.theme.accent3), margin: 0, fit: "shrink" });
  } else {
    if (item.body) slide.addText(item.body, { x: 0.75, y: 3.1, w: 5.2, h: 2.0, fontSize: 16, color: c(presentation.theme.paper), margin: 0.05, breakLine: false, fit: "shrink" });
    if (item.bullets?.length) slide.addText(item.bullets.map((bullet) => ({ text: bullet, options: { bullet: { indent: 12 }, hanging: 3 } })), { x: 6.15, y: 3.1, w: 3.0, h: 2.3, fontSize: 13, color: c(presentation.theme.paper), breakLine: false, margin: 0.08, valign: "mid", fit: "shrink" });
  }
  if (item.callout) slide.addText(item.callout, { x: 0.75, y: 6.2, w: 8.7, h: 0.45, fontSize: 12, color: c(presentation.theme.paper), fill: { color: c(presentation.theme.accent3), transparency: 84 }, margin: 0.12, fit: "shrink" });
};

presentation.slides.forEach((item, index) => {
  const slide = pptx.addSlide();
  slide.background = { color: c(presentation.theme.ink) };
  addHeader(slide, item, index);
  addBody(slide, item);
  addPresenter(slide, item);
  slide.addText(`${presentation.title}  ·  ${item.id}`, { x: 0.55, y: 7.05, w: 10, h: 0.18, fontSize: 7, color: c(presentation.theme.muted), margin: 0, charSpacing: 1 });
});

const outputPath = path.join(outputDir, `${presentation.id}.pptx`);
await pptx.writeFile({ fileName: outputPath });
console.log(`PPTX written: ${outputPath}`);
