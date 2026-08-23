import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

export function resolveFromRoot(filePath, fallback) {
  return path.resolve(root, filePath ?? fallback);
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function loadDeckFiles(args) {
  const presentationPath = resolveFromRoot(args.presentation, "content/presentation.json");
  const manifestPath = resolveFromRoot(args.manifest, "content/audio-manifest.json");
  const presentation = readJson(presentationPath);
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
  return { presentation, manifest, presentationPath, manifestPath };
}

export function assertSafeAudioPath(audioPath) {
  if (typeof audioPath !== "string" || !audioPath || path.isAbsolute(audioPath) || audioPath.includes("..")) {
    throw new Error(`Audio path must stay under public/: ${audioPath}`);
  }
  return audioPath;
}

export function getAudioAssetPath(audioPath) {
  return path.join(root, "public", assertSafeAudioPath(audioPath));
}

export function getOutputDir(args) {
  return resolveFromRoot(args["output-dir"] ?? args.outputDir, "out");
}
