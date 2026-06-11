import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // Workspace source (and its tiny pure-JS dep) bundle into dist so the
  // runtime image needs only the server's own node_modules (see Dockerfile).
  noExternal: ["@caravan/shared", "fractional-indexing"],
});
