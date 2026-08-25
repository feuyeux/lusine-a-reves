import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getOutputDir, getPublicDir, loadDeckFiles, parseCliArgs, root } from "./lib.mjs";
import { assertRenderedVideoAudible } from "./media.mjs";

const args = parseCliArgs(process.argv.slice(2), {
  command: "render.mjs",
  description: "Refresh the manifest, validate, then render the deck to MP4.",
});
const { presentation } = loadDeckFiles(args);
const remotion = path.join(root, "node_modules", "@remotion", "cli", "remotion-cli.js");
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(process.execPath, ["core/scripts/build-audio-manifest.mjs", ...process.argv.slice(2)]);
run(process.execPath, ["core/scripts/validate-deck.mjs", ...process.argv.slice(2)]);
const { manifest } = loadDeckFiles(args);
const outputDir = getOutputDir(args);
fs.mkdirSync(outputDir, { recursive: true });
const propsPath = path.join(outputDir, ".render-props.json");
fs.writeFileSync(propsPath, `${JSON.stringify({ presentation, audioManifest: manifest }, null, 2)}\n`);
const outputPath = path.join(outputDir, `${process.env.PRESENTATION_ID || presentation.id}.mp4`);
run(process.execPath, [remotion, "render", path.join(root, "core", "src", "index.ts"), "Presentation", outputPath, "--props", propsPath, "--public-dir", getPublicDir(args)]);
if (presentation.slides.some((slide) => slide.audio)) {
  assertRenderedVideoAudible(outputPath);
  console.log(`Rendered media passed audio gate: ${outputPath}`);
}
if (!process.env.KEEP_RENDER_PROPS) fs.rmSync(propsPath, { force: true });
