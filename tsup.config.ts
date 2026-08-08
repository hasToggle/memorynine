import { defineConfig } from "tsup";

export default defineConfig({
  // TypeScript 7 (native) removed the JS compiler API that rollup-plugin-dts
  // needs; only dist/index.js ships (see "files"), so no consumer loses types.
  dts: false,
  entry: ["scripts/index.ts"],
  format: ["cjs", "esm"],
  minify: true,
  outDir: "dist",
  sourcemap: false,
});
