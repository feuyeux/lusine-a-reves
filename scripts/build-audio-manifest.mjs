import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAudioAssetPath, loadDeckFiles, parseArgs, resolveFromRoot } from "./lib.mjs";
import { assertAudibleAudio } from "./media.mjs";

const args = parseArgs(process.argv.slice(2));
const { presentation } = loadDeckFiles(args);
const outputPath = resolveFromRoot(args.manifest, "content/audio-manifest.json");
const audioPaths = [...new Set((presentation.slides ?? []).map((slide) => slide.audio).filter(Boolean))];
const manifest = {};

for (const audioPath of audioPaths) {
  const absolutePath = getAudioAssetPath(audioPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing audio asset: public/${audioPath}`);
  const probe = assertAudibleAudio(absolutePath, `Audio asset ${audioPath}`);
  const bytes = fs.readFileSync(absolutePath);
  manifest[audioPath] = {
    path: audioPath,
    durationSec: probe.durationSec,
    sampleRate: probe.sampleRate,
    channels: probe.channels,
    maxDb: probe.maxDb,
    meanDb: probe.meanDb,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Audio manifest written: ${audioPaths.length} entries.`);
