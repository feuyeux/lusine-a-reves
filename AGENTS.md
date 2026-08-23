# Repository Guidelines

## Project Structure

- `src/` contains the Remotion composition, presentation domain types, and fixed `lina-tech-v1` human presenter.
- `scripts/` contains validation, audio-manifest, PPTX export, and video-render entry points.
- `content/` stores the reusable presentation JSON and deterministic TTS profile; `public/` stores runtime media and assets.
- `python/lusine_builder/` is the `uv`-managed Python package for cross-platform orchestration and auditable TTS request planning.
- `test/` contains Node test files; `python/tests/` contains Python tests. Architecture and TTS decisions live in `docs/`.
- Treat `build/`, `out/`, `.venv/`, and Python caches as generated or local-only data. Do not commit them.

## Build, Test, and Development Commands

Install both runtimes with `npm install` and `uv sync`. Use `npm run dev` for Remotion Studio. Run `npm run voiceover -- --force` to generate the fixed-profile Windows narration, then `npm run manifest` and `npm run check` to validate audio timing and assets. `uv run lusine-meta doctor` checks local prerequisites. Use `npm run export:pptx` and `npm run render` to build PPTX and MP4 outputs. `npm run lint` runs ESLint and TypeScript checks, while `npm test` and `uv run pytest` run the JavaScript and Python suites. `npm run build` creates the Remotion bundle.

## Coding Style and Naming

Use two spaces, semicolons, and existing ESLint/TypeScript conventions in JavaScript and TypeScript. Use four spaces and standard Python naming (`snake_case` functions, `PascalCase` classes). Use `camelCase` for TypeScript values and `PascalCase` for React components. Prefer repository-relative paths and `path`/`pathlib` APIs; never hard-code a drive letter or platform-specific separator. Keep public interfaces and content schemas typed and validated.

## Content and TTS Rules

Edit presentation material in `content/presentation.json`. Keep voice, speaker, language, sampling, rate, volume, and emotion instructions centralized in the selected TTS profile; page-level code must not silently change them. The default Windows profile uses fixed System.Speech settings; Qwen3-TTS and Edge profiles are explicit alternatives. Preserve the fixed `lina-tech-v1` presenter design, including facial detail, clothing, mouth animation, and audio visualization. TTS plans must remain deterministic and auditable through their profile and request hashes.

## Testing Guidelines

Name Node tests `*.test.mjs` and Python tests `test_*.py`. Add coverage for schema changes, path portability, deterministic TTS hashes, manifest timing, and rendered-output contracts. Run the full command set above before submitting media or pipeline changes.

## Commits and Pull Requests

There is no existing Git history, so use Conventional Commit prefixes such as `feat:`, `fix:`, `test:`, `docs:`, and `chore:`. PRs should describe the input and generated outputs, link relevant issues, list verification commands, and include screenshots or a media preview for visual changes. Update `package-lock.json` or `uv.lock` when dependencies change.
