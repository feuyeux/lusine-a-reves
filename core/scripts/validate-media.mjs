import path from "node:path";
import { assertRenderedVideoAudible } from "./media.mjs";

const filePath = process.argv[2];
if (!filePath) throw new Error("Usage: node core/scripts/validate-media.mjs <video-path>");

const measurement = assertRenderedVideoAudible(path.resolve(filePath));
console.log(
  `Media valid: ${filePath} (${measurement.durationSec.toFixed(2)}s, `
  + `max ${measurement.maxDb.toFixed(1)} dB, mean ${measurement.meanDb.toFixed(1)} dB).`,
);
