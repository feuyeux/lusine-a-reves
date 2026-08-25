import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { assertAudibleAudio } from "./media.mjs";
import { getAudioAssetPath, loadDeckFiles, parseCliArgs, readJson, resolveFromRoot } from "./lib.mjs";

const args = parseCliArgs(process.argv.slice(2), {
  command: "generate-voiceover.mjs",
  description: "Generate narration audio with the selected TTS profile.",
});
const { presentation } = loadDeckFiles(args);
const profilePath = resolveFromRoot(args.profile, "core/profiles/tts-profile.json");
const profile = readJson(profilePath);
const provider = profile.provider;
if (!['edge-tts', 'windows-sapi', 'cosyvoice2'].includes(provider)) {
  throw new Error(
    `The local voiceover command does not support provider '${provider}'. `
    + "Use a dedicated adapter rather than silently falling back to a different voice.",
  );
}

const voice = profile.voice;
const rate = profile.rate;
const pitch = profile.pitchAdjustment ?? profile.pitch ?? "+0Hz";
const volume = profile.volumeAdjustment ?? "+0%";
const sapiVolume = profile.volumePercent ?? 100;
const command = process.env.EDGE_TTS_BIN || (process.platform === "win32" ? "edge-tts.exe" : "edge-tts");
const force = Boolean(args.force);
const narratedSlides = presentation.slides.filter((slide) => slide.narration);

if (narratedSlides.length === 0) {
  throw new Error("No slide narration found in the presentation.");
}

function toWslPath(filePath) {
  const absolute = path.resolve(filePath);
  const drive = absolute.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!drive) return absolute.replaceAll("\\", "/");
  return `/mnt/${drive[1].toLowerCase()}/${drive[2].replaceAll("\\", "/")}`;
}

function runCosyVoiceBatch(requests, requestFile) {
  // CosyVoice2 only runs on Linux+CUDA, so Windows hosts always shell out
  // through WSL2. The Python adapter itself lives in the uv-managed package
  // so it shares the same versioned dependency surface as tts.py.
  const adapterModule = "python.lusine_builder.cosyvoice_adapter";
  let command;
  let commandArgs;
  if (process.platform === "win32") {
    command = "wsl.exe";
    const wslPython = process.env.COSYVOICE_PYTHON_WSL
      || profile.wslPython
      || "/mnt/d/zoo/cosyvoice/.venv/bin/python";
    commandArgs = [
      "-d", profile.wslDistro || "Ubuntu",
      "--",
      wslPython,
      "-m", adapterModule,
      "--profile", toWslPath(profilePath),
      "--requests", toWslPath(requestFile),
    ];
  } else {
    command = process.env.COSYVOICE_PYTHON || "python3";
    commandArgs = ["-m", adapterModule, "--profile", profilePath, "--requests", requestFile];
  }
  const result = spawnSync(command, commandArgs, { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) {
    throw new Error(`cosyvoice2 failed: ${result.error?.message || `exit ${result.status}`}`);
  }
}

if (provider === "cosyvoice2") {
  const pending = [];
  for (const slide of narratedSlides) {
    const audioPath = slide.audio || `audio/${slide.id}.${profile.format || "wav"}`;
    if (!/^[a-zA-Z0-9_./-]+\.(wav|mp3|m4a)$/.test(audioPath) || audioPath.includes("..")) {
      throw new Error(`Invalid audio path for ${slide.id}: ${audioPath}`);
    }
    const output = getAudioAssetPath(audioPath, args);
    const temporary = `${output}.tmp.wav`;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (!force && fs.existsSync(output)) {
      assertAudibleAudio(output, `Existing voiceover ${audioPath}`);
      console.log(`Voiceover exists: ${audioPath}`);
      continue;
    }
    fs.rmSync(temporary, { force: true });
    pending.push({
      slideId: slide.id,
      text: slide.narration,
      output: process.platform === "win32" ? toWslPath(temporary) : temporary,
      outputPath: output,
      temporary,
      audioPath,
    });
  }

  if (pending.length > 0) {
    const requestFile = resolveFromRoot("out/tts/cosyvoice2-requests.json");
    fs.mkdirSync(path.dirname(requestFile), { recursive: true });
    fs.writeFileSync(requestFile, `${JSON.stringify(pending.map((item) => ({
      slideId: item.slideId,
      text: item.text,
      output: item.output,
    })), null, 2)}\n`);
    try {
      runCosyVoiceBatch(pending, requestFile);
      for (const item of pending) {
        const measurement = assertAudibleAudio(item.temporary, `Generated voiceover ${item.audioPath}`);
        fs.rmSync(item.outputPath, { force: true });
        fs.renameSync(item.temporary, item.outputPath);
        console.log(`Voiceover generated: ${item.audioPath} (${measurement.durationSec.toFixed(2)}s)`);
      }
    } finally {
      fs.rmSync(requestFile, { force: true });
    }
  }
  console.log(`Voiceover profile: ${profile.profileId} / CosyVoice2 zero-shot / seed=${profile.seed}`);
  process.exit(0);
}

for (const slide of narratedSlides) {
  const audioPath = slide.audio || `audio/${slide.id}.${profile.format || "mp3"}`;
  if (!/^[a-zA-Z0-9_./-]+\.(wav|mp3|m4a)$/.test(audioPath) || audioPath.includes("..")) {
    throw new Error(`Invalid audio path for ${slide.id}: ${audioPath}`);
  }
  const output = getAudioAssetPath(audioPath, args);
  const temporary = `${output}.tmp`;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (!force && fs.existsSync(output)) {
    assertAudibleAudio(output, `Existing voiceover ${audioPath}`);
    console.log(`Voiceover exists: ${audioPath}`);
    continue;
  }
  fs.rmSync(temporary, { force: true });
  const commandArgs = provider === "windows-sapi"
    ? [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      resolveFromRoot("core/scripts/synthesize-sapi.ps1"),
      "-Text", slide.narration,
      "-Output", temporary,
      "-Voice", voice,
      "-Rate", String(rate),
      "-Volume", String(sapiVolume),
    ]
    : [
      `--voice=${voice}`,
      `--rate=${rate}`,
      `--volume=${volume}`,
      `--pitch=${pitch}`,
      "--text", slide.narration,
      "--write-media", temporary,
    ];
  const ttsCommand = provider === "windows-sapi" ? "powershell.exe" : command;
  const result = spawnSync(ttsCommand, commandArgs, { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) {
    throw new Error(`${provider} failed for ${slide.id}: ${result.error?.message || `exit ${result.status}`}`);
  }
  const measurement = assertAudibleAudio(temporary, `Generated voiceover ${audioPath}`);
  fs.rmSync(output, { force: true });
  fs.renameSync(temporary, output);
  console.log(`Voiceover generated: ${audioPath} (${measurement.durationSec.toFixed(2)}s)`);
}

console.log(`Voiceover profile: ${profile.profileId} / ${voice} / ${rate} / ${pitch} / ${provider === "windows-sapi" ? sapiVolume : volume}`);
