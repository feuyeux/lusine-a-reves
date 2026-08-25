import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

export function assertConfirmedBrief(briefPath) {
  const resolvedPath = resolveFromRoot(briefPath, "");
  let brief;
  try {
    brief = readJson(resolvedPath);
  } catch (error) {
    throw new Error(`Unable to read topic brief: ${resolvedPath} (${error.message})`);
  }
  if (brief?.schemaVersion !== 1 || brief?.kind !== "topic-intent" || brief?.status !== "confirmed") {
    throw new Error(`Topic brief must be confirmed before building: ${resolvedPath}`);
  }
  return brief;
}

export function loadDeckFiles(args) {
  const presentationPath = resolveFromRoot(args.presentation, "example/content/presentation.json");
  const manifestPath = resolveFromRoot(args.manifest, "example/content/audio-manifest.json");
  const presentation = readJson(presentationPath);
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
  return { presentation, manifest, presentationPath, manifestPath };
}

/**
 * Assets referenced by a deck must resolve inside the caller's public/ dir.
 * Rejects absolute paths and any `..` traversal segment.
 */
export function assertSafePublicPath(assetPath) {
  if (
    typeof assetPath !== "string"
    || !assetPath
    || path.isAbsolute(assetPath)
    || assetPath.split(/[/\\]/).includes("..")
  ) {
    throw new Error(`Asset path must stay under public/: ${assetPath}`);
  }
  return assetPath;
}

/** Backwards-compatible alias used by the audio pipeline. */
export const assertSafeAudioPath = assertSafePublicPath;

export function getPublicDir(args = {}) {
  return resolveFromRoot(args["public-dir"] ?? args.publicDir, "example/public");
}

export function getPublicAssetPath(assetPath, args = {}) {
  return path.join(getPublicDir(args), assertSafePublicPath(assetPath));
}

/** Backwards-compatible alias used by the audio pipeline. */
export const getAudioAssetPath = getPublicAssetPath;

export function getOutputDir(args) {
  return resolveFromRoot(args["output-dir"] ?? args.outputDir, "out");
}
