# Repository Guidelines

## Project Structure

- `core/` contains reusable source, scripts, tests, Python tooling, TTS profiles, and architecture docs.
- `example/` contains only the `signals-systems-stories` sample content, media, manifest, and preview image.
- Root files contain the shared npm, TypeScript, Remotion, and uv entry-point configuration.
- Treat `build/`, `out/`, `.venv/`, and Python caches as generated or local-only data. Do not commit them.

## Build, Test, and Development Commands

Install both runtimes with `npm install` and `uv sync`. Use `npm run dev` for Remotion Studio. Run `npm run voiceover -- --force` to generate the fixed-profile Windows narration, then `npm run manifest` and `npm run check` to validate audio timing and assets. `uv run lusine-meta doctor` checks local prerequisites. Use `npm run export:pptx` and `npm run render` to build PPTX and MP4 outputs. `npm run lint` runs ESLint and TypeScript checks, while `npm test` and `uv run pytest` run the JavaScript and Python suites. `npm run build` creates the Remotion bundle.

## Coding Style and Naming

Use two spaces, semicolons, and existing ESLint/TypeScript conventions in JavaScript and TypeScript. Use four spaces and standard Python naming (`snake_case` functions, `PascalCase` classes). Use `camelCase` for TypeScript values and `PascalCase` for React components. Prefer repository-relative paths and `path`/`pathlib` APIs; never hard-code a drive letter or platform-specific separator. Keep public interfaces and content schemas typed and validated.

## Content and TTS Rules

New presentation material belongs in a caller-owned directory passed with `--presentation`, `--public-dir`, and `--manifest`; do not edit `example/` for new topics. Keep voice, speaker, language, sampling, rate, volume, and emotion instructions centralized in the selected TTS profile. TTS plans must remain deterministic and auditable through their profile and request hashes.

## Testing Guidelines

Name Node tests `*.test.mjs` and Python tests `test_*.py`. Add coverage for schema changes, path portability, deterministic TTS hashes, manifest timing, and rendered-output contracts. Run the full command set above before submitting media or pipeline changes.

## Commits and Pull Requests

There is no existing Git history, so use Conventional Commit prefixes such as `feat:`, `fix:`, `test:`, `docs:`, and `chore:`. PRs should describe the input and generated outputs, link relevant issues, list verification commands, and include screenshots or a media preview for visual changes. Update `package-lock.json` or `uv.lock` when dependencies change.
