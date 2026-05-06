// Flat-config ESLint setup. Targets the React + TypeScript front-end
// only — the Rust shell has its own toolchain (clippy / cargo check).
//
// Rules are kept pragmatic, not zealous: we want signal on real bugs
// and stop bikeshedding about style (Prettier handles formatting).

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "src-tauri/target", "src-tauri/gen", "node_modules"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Keep the bedrock rules — these catch real bugs.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // The v7 plugin added rules that flag idiomatic React patterns
      // (load-on-mount via useEffect+setState, Math.random inside event
      // handlers) as if they were render-time impurity bugs. They're
      // not — React's own docs document the load-in-effect pattern as
      // valid. Disabling these specific rules until they stabilize.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",

      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // We rely on TS for unused-symbol detection (noUnusedLocals etc.)
      // and disable the JS rule so it doesn't double-fire on type-only
      // imports.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // `any` is occasionally pragmatic (third-party shapes). Warn, don't error.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
