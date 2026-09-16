import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { assertAudibleAudio } from "./media.mjs";
import {
  getAudioAssetPath,
  loadDeckFiles,
  parseCliArgs,
  readJson,
  resolveFromRoot,
} from "./lib.mjs";

const args = parseCliArgs(process.argv.slice(2), {
  command: "run-edge-tts.mjs",
  description: "Synthesize an Edge TTS profile to 24 kHz mono PCM WAV files.",
});
const { presentation } = loadDeckFiles(args);
const profilePath = resolveFromRoot(args.profile, "core/profiles/tts-profile.edge-tts.json");
const profile = readJson(profilePath);
if (profile.provider !== "edge-tts") throw new Error(`Expected an edge-tts profile: ${profilePath}`);
if (profile.format !== "wav" || profile.sampleRate !== 24000 || profile.channels !== 1) {
  throw new Error("Edge TTS production profiles must produce 24 kHz mono WAV output");
}

const runtimeDir = resolveFromRoot(args["runtime-dir"], ".tts-runtime/edge-tts");
const python = args["edge-tts-python"]
  ?? process.env.EDGE_TTS_PYTHON
  ?? path.join(runtimeDir, ".venv", "bin", "python");
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
const force = Boolean(args.force);
const narratedSlides = presentation.slides.filter((slide) => slide.narration);
if (narratedSlides.length === 0) throw new Error("No slide narration found in the presentation.");

const run = (command, commandArgs, label) => {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed: ${result.error?.message || `exit ${result.status}`}`);
  }
};

const runEdgeWithRetry = (commandArgs, label, temporaryPath, attempts = 5) => {
  let lastResult;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    fs.rmSync(temporaryPath, { force: true });
    lastResult = spawnSync(python, commandArgs, { stdio: "inherit", shell: false });
    if (!lastResult.error && lastResult.status === 0) return;
    if (attempt < attempts) {
      console.warn(`${label} failed on attempt ${attempt}/${attempts}; retrying with the same profile.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 5000);
    }
  }
  throw new Error(
    `${label} failed after ${attempts} attempts: ${lastResult?.error?.message || `exit ${lastResult?.status}`}`,
  );
};

for (const slide of narratedSlides) {
  const audioPath = slide.audio || `audio/${slide.id}.wav`;
  if (!audioPath.endsWith(".wav")) {
    throw new Error(`Edge TTS emits normalized WAV only; ${slide.id} must use a .wav audio path`);
  }
  const output = getAudioAssetPath(audioPath, args);
  const rawMp3 = `${output}.edge-tts.mp3`;
  const temporaryWav = `${output}.tmp.wav`;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (!force && fs.existsSync(output)) {
    assertAudibleAudio(output, `Existing voiceover ${audioPath}`);
    console.log(`Voiceover exists: ${audioPath}`);
    continue;
  }
  fs.rmSync(rawMp3, { force: true });
  fs.rmSync(temporaryWav, { force: true });
  try {
    runEdgeWithRetry([
      "-m", "edge_tts",
      `--voice=${profile.voice}`,
      `--rate=${profile.rate}`,
      `--volume=${profile.volumeAdjustment}`,
      `--pitch=${profile.pitchAdjustment}`,
      "--text", slide.narration,
      "--write-media", rawMp3,
    ], `edge-tts synthesis for ${slide.id}`, rawMp3);
    run(ffmpeg, [
      "-y", "-i", rawMp3,
      "-ar", String(profile.sampleRate), "-ac", String(profile.channels),
      "-c:a", "pcm_s16le", temporaryWav,
    ], `FFmpeg conversion for ${slide.id}`);
    const measurement = assertAudibleAudio(temporaryWav, `Generated voiceover ${audioPath}`);
    fs.rmSync(output, { force: true });
    fs.renameSync(temporaryWav, output);
    console.log(`Voiceover generated: ${audioPath} (${measurement.durationSec.toFixed(2)}s)`);
    // The online consumer endpoint rate-limits rapid sequential requests.
    // A small deterministic gap is cheaper and more reliable than changing voice.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  } finally {
    fs.rmSync(rawMp3, { force: true });
    fs.rmSync(temporaryWav, { force: true });
  }
}

console.log(`Voiceover profile: ${profile.profileId} / ${profile.voice} / ${profile.rate} / 24 kHz mono WAV`);
