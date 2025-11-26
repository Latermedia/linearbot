import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { bunSqliteShim } from "./vite-plugin-bun-sqlite-shim.js";

export default defineConfig({
  plugins: [bunSqliteShim(), sveltekit()],
  server: {
    fs: {
      allow: ["."],
    },
  },
  ssr: {
    external: [
      "bun:sqlite",
      "./src/db/connection.js",
      "./src/utils/domain-mapping.js",
    ],
    noExternal: [],
  },
  resolve: {
    conditions: ["browser"],
  },
});
