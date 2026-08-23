import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["node_modules/**", "out/**", "dist/**", "content/audio-manifest.json"],
  },
  {
    files: ["scripts/**/*.mjs", "test/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
