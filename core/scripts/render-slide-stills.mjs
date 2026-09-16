import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { AudioManifestSchema, parsePresentation } from "../src/domain.ts";
import { buildTimeline } from "../src/timeline.ts";
import { getOutputDir, getPublicDir, loadDeckFiles, parseCliArgs, root } from "./lib.mjs";

const args = parseCliArgs(process.argv.slice(2), {
  command: "render-slide-stills.mjs",
  description: "Render one 1920x1080 PNG still per slide from a presentation deck.",
});
const { presentation: rawPresentation, manifest: rawManifest } = loadDeckFiles(args);
const presentation = parsePresentation(rawPresentation);
const manifest = AudioManifestSchema.parse(rawManifest);
const timeline = buildTimeline(presentation, manifest);
const outputDir = getOutputDir(args);
const stillsDir = path.join(outputDir, "stills");
const bundleDir = path.join(outputDir, ".stills-bundle");
fs.rmSync(stillsDir, { recursive: true, force: true });
fs.rmSync(bundleDir, { recursive: true, force: true });
fs.mkdirSync(stillsDir, { recursive: true });

try {
  const serveUrl = await bundle({
    entryPoint: path.join(root, "core", "src", "index.ts"),
    outDir: bundleDir,
    publicDir: getPublicDir(args),
    rspack: true,
    symlinkPublicDir: true,
    onProgress: () => undefined,
  });
  const inputProps = { presentation, audioManifest: manifest };
  const composition = await selectComposition({
    serveUrl,
    id: "Presentation",
    inputProps,
    logLevel: "error",
  });
  const records = [];
  for (const [index, slide] of timeline.slides.entries()) {
    // Capture after the restrained entry transition settles, but inside the
    // slide's own Sequence. This yields one lossless PNG per semantic page.
    const settleFrames = Math.max(1, Math.round(presentation.fps * 0.7));
    const frame = slide.startFrame + Math.min(settleFrames, slide.durationInFrames - 1);
    const fileName = `slide-${String(index + 1).padStart(2, "0")}.png`;
    const output = path.join(stillsDir, fileName);
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      frame,
      output,
      imageFormat: "png",
      overwrite: true,
      logLevel: "error",
    });
    records.push({
      slideId: slide.id,
      file: fileName,
      frame,
      startFrame: slide.startFrame,
      durationInFrames: slide.durationInFrames,
    });
    console.log(`Still ${index + 1}/${timeline.slides.length}: ${output}`);
  }
  fs.writeFileSync(
    path.join(outputDir, "stills-manifest.json"),
    `${JSON.stringify({ width: presentation.width, height: presentation.height, fps: presentation.fps, slides: records }, null, 2)}\n`,
  );
} finally {
  fs.rmSync(bundleDir, { recursive: true, force: true });
}
