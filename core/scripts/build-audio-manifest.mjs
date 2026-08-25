import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getPublicAssetPath, loadDeckFiles, parseCliArgs, resolveFromRoot } from "./lib.mjs";
import { assertAudibleAudio } from "./media.mjs";

const args = parseCliArgs(process.argv.slice(2), {
  command: "build-audio-manifest.mjs",
  description: "Probe every referenced audio file and write the timing manifest.",
});
const { presentation } = loadDeckFiles(args);
const outputPath = resolveFromRoot(args.manifest, "example/content/audio-manifest.json");
const audioPaths = [...new Set((presentation.slides ?? []).map((slide) => slide.audio).filter(Boolean))];

/*
 * Probing means one ffprobe plus one ffmpeg volumedetect per file, and
 * volumedetect decodes the whole stream. render.mjs refreshes the manifest on
 * every run, so unchanged audio is matched by content hash and its previous
 * measurements are reused. `--force` re-probes everything.
 */
const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, "utf8")) : {};
const reuseAllowed = !args.force;
const manifest = {};
let reused = 0;
let probed = 0;

for (const audioPath of audioPaths) {
  const absolutePath = getPublicAssetPath(audioPath, args);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing audio asset: ${absolutePath}`);
  const bytes = fs.readFileSync(absolutePath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const cached = previous[audioPath];

  // Reuse only when the hash matches and the cached entry is complete.
  if (
    reuseAllowed
    && cached?.sha256 === sha256
    && cached.path === audioPath
    && Number(cached.durationSec) > 0
    && Number.isFinite(cached.maxDb)
    && Number.isFinite(cached.meanDb)
  ) {
    manifest[audioPath] = cached;
    reused += 1;
    continue;
  }

  const probe = assertAudibleAudio(absolutePath, `Audio asset ${audioPath}`);
  probed += 1;
  manifest[audioPath] = {
    path: audioPath,
    durationSec: probe.durationSec,
    sampleRate: probe.sampleRate,
    channels: probe.channels,
    maxDb: probe.maxDb,
    meanDb: probe.meanDb,
    sha256,
  };
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Audio manifest written: ${audioPaths.length} entries (${probed} probed, ${reused} reused).`);
