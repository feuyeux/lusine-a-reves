import { spawnSync } from "node:child_process";

const ffprobe = process.env.FFPROBE_BIN || "ffprobe";
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
const nullOutput = process.platform === "win32" ? "NUL" : "/dev/null";

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const detail = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
    throw new Error(`${command} failed: ${detail}`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

export function probeAudio(filePath) {
  const payload = JSON.parse(run(ffprobe, [
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
    "-of", "json",
    filePath,
  ]));
  const stream = payload.streams?.[0];
  const durationSec = Number(payload.format?.duration);
  if (!stream || !Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error(`No valid audio stream found in ${filePath}`);
  }
  return {
    codec: stream.codec_name,
    durationSec,
    sampleRate: Number(stream.sample_rate) || undefined,
    channels: Number(stream.channels) || undefined,
  };
}

export function measureAudio(filePath) {
  const output = run(ffmpeg, [
    "-hide_banner",
    "-i", filePath,
    "-map", "0:a:0",
    "-af", "volumedetect",
    "-f", "null",
    nullOutput,
  ]);
  const maxMatch = output.match(/max_volume:\s*(-?[\d.]+)\s*dB/);
  const meanMatch = output.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
  if (!maxMatch || !meanMatch) {
    throw new Error(`FFmpeg did not return volume statistics for ${filePath}`);
  }
  return {
    maxDb: Number(maxMatch[1]),
    meanDb: Number(meanMatch[1]),
  };
}

export function isAudibleAudio(measurement) {
  return measurement.durationSec > 0
    && measurement.maxDb > -60
    && measurement.meanDb > -80;
}

export function assertAudibleAudio(filePath, label = filePath) {
  const probe = probeAudio(filePath);
  const loudness = measureAudio(filePath);
  const measurement = { ...probe, ...loudness };
  if (!isAudibleAudio(measurement)) {
    throw new Error(
      `${label} is silent or too quiet: max=${measurement.maxDb.toFixed(1)} dB, `
      + `mean=${measurement.meanDb.toFixed(1)} dB`,
    );
  }
  return measurement;
}

export function assertRenderedVideoAudible(filePath) {
  const payload = JSON.parse(run(ffprobe, [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,duration:format=duration",
    "-of", "json",
    filePath,
  ]));
  if (!payload.streams?.some((stream) => stream.codec_type === "video")) {
    throw new Error(`Rendered file has no video stream: ${filePath}`);
  }
  return assertAudibleAudio(filePath, `Rendered video ${filePath}`);
}
