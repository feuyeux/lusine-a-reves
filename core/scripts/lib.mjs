import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Flags shared by the deck pipeline. Unknown flags are rejected rather than
 * ignored: a typo like `--presentaton` used to silently validate the bundled
 * example instead of the caller's deck.
 */
export const KNOWN_FLAGS = Object.freeze({
  presentation: "content JSON path",
  manifest: "audio manifest path",
  "public-dir": "topic public/ directory",
  publicDir: "alias of --public-dir",
  "output-dir": "output directory",
  outputDir: "alias of --output-dir",
  profile: "TTS profile path",
  brief: "confirmed topic brief path",
  force: "regenerate existing voiceover files",
  help: "show usage and exit",
});

/** Levenshtein distance, used only to suggest a flag for a typo. */
function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  return rows[a.length][b.length];
}

function suggestFlag(key) {
  const candidates = Object.keys(KNOWN_FLAGS)
    .map((flag) => ({ flag, distance: editDistance(key, flag) }))
    .filter(({ distance }) => distance <= 3)
    .sort((left, right) => left.distance - right.distance);
  return candidates[0]?.flag;
}

export function usage(command, extraFlags = {}) {
  const flags = { ...KNOWN_FLAGS, ...extraFlags };
  const lines = Object.entries(flags).map(([flag, description]) => `  --${flag.padEnd(14)} ${description}`);
  return `Usage: node core/scripts/${command} [flags]\n\nFlags:\n${lines.join("\n")}`;
}

export function parseArgs(argv, extraFlags = {}) {
  const allowed = new Set([...Object.keys(KNOWN_FLAGS), ...Object.keys(extraFlags)]);
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (!allowed.has(key)) {
      const suggestion = suggestFlag(key);
      throw new Error(
        `Unknown flag: --${key}${suggestion ? ` (did you mean --${suggestion}?)` : ""}`
        + `\nKnown flags: ${[...allowed].map((flag) => `--${flag}`).join(", ")}`,
      );
    }
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

/**
 * Script-facing wrapper: parseArgs stays throwing (and unit-testable) while
 * callers get a one-line error instead of a stack trace.
 */
export function parseCliArgs(argv, { command, description, extraFlags = {} } = {}) {
  let args;
  try {
    args = parseArgs(argv, extraFlags);
  } catch (error) {
    console.error(error.message);
    if (command) console.error(`\n${usage(command, extraFlags)}`);
    process.exit(1);
  }
  if (args.help) {
    if (description) console.log(`${description}\n`);
    console.log(usage(command ?? "<script>", extraFlags));
    process.exit(0);
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
