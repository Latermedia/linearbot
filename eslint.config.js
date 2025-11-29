import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  // Base recommended configs
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs["flat/recommended"],
  prettier,
  ...svelte.configs["flat/prettier"],
  // Global settings
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        Bun: "readonly",
      },
    },
    rules: {
      // Allow unused vars prefixed with underscore
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Allow explicit any - too strict for existing codebase
      "@typescript-eslint/no-explicit-any": "off",
      // Allow unused expressions (Svelte snippets use these)
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  // Svelte-specific overrides
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: [".svelte"],
      },
    },
    rules: {
      // Allow unused vars prefixed with underscore
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Svelte 5 reactivity rules - warn instead of error
      "svelte/prefer-svelte-reactivity": "warn",
      // Each key is good practice but not always necessary
      "svelte/require-each-key": "warn",
      // Navigation rules - off for internal app links
      "svelte/no-navigation-without-resolve": "off",
      // Dupe style properties - sometimes intentional for prefixes
      "svelte/no-dupe-style-properties": "warn",
    },
  },
  // Ignore patterns
  {
    ignores: ["build/", ".svelte-kit/", "node_modules/", "terminal/"],
  },
];
