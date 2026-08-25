import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getOutputDir, getPublicDir, loadDeckFiles, parseCliArgs, root } from "./lib.mjs";

/*
 * Launch Remotion Studio against any topic, not just the bundled example.
 * Mirrors render.mjs: the deck and manifest are passed as Remotion input
 * props, so core/src/content.ts stays free of Node-only file access.
 *
 *   npm run dev
 *   npm run dev -- --presentation work/my-topic/presentation.json \
 *                  --manifest work/my-topic/audio-manifest.json \
 *                  --public-dir work/my-topic/public
 */
const args = parseCliArgs(process.argv.slice(2), {
  command: "studio.mjs",
  description: "Open Remotion Studio on a deck (defaults to the bundled example).",
});
const { presentation, manifest } = loadDeckFiles(args);
const outputDir = getOutputDir(args);
fs.mkdirSync(outputDir, { recursive: true });
const propsPath = path.join(outputDir, ".studio-props.json");
fs.writeFileSync(propsPath, `${JSON.stringify({ presentation, audioManifest: manifest }, null, 2)}\n`);

const remotion = path.join(root, "node_modules", "@remotion", "cli", "remotion-cli.js");
const result = spawnSync(process.execPath, [
  remotion,
  "studio",
  path.join(root, "core", "src", "index.ts"),
  "--props", propsPath,
  "--public-dir", getPublicDir(args),
], { stdio: "inherit", shell: false });
if (result.error) throw result.error;
process.exit(result.status ?? 0);
