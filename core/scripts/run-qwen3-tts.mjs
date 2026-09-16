import { spawnSync } from "node:child_process";
import path from "node:path";
import { getPublicDir, parseCliArgs, resolveFromRoot, root } from "./lib.mjs";

const args = parseCliArgs(process.argv.slice(2), {
  command: "run-qwen3-tts.mjs",
  description: "Execute a deterministic Qwen3-TTS request plan with the isolated runtime.",
});
const planPath = resolveFromRoot(args.plan, "out/tts/plan.json");
const runtimeDir = resolveFromRoot(args["runtime-dir"], ".tts-runtime/qwen3-tts");
const python = args["qwen-python"]
  ?? process.env.QWEN3_TTS_PYTHON
  ?? path.join(runtimeDir, ".venv", "bin", "python");
const device = args.device ?? process.env.QWEN3_TTS_DEVICE ?? "cuda:0";
const adapter = path.join(root, "core", "python", "lusine_builder", "qwen3_adapter.py");
const result = spawnSync(python, [
  adapter,
  "--plan", planPath,
  "--public-dir", getPublicDir(args),
  "--device", device,
], { stdio: "inherit", shell: false });
if (result.error || result.status !== 0) {
  throw new Error(`qwen3-tts failed: ${result.error?.message || `exit ${result.status}`}`);
}
