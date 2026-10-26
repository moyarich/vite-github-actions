import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { githubActions } from "../src/index";

describe("vite-github-actions", () => {
  it("discovers Node entries from action metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "vite-actions-"));
    try {
      mkdirSync(join(root, "metadata/example"), { recursive: true });
      mkdirSync(join(root, "src/example"), { recursive: true });
      writeFileSync(join(root, "metadata/example/action.yml"), "name: Example\nruns:\n  using: node24\n  main: index.mjs\n");
      writeFileSync(join(root, "src/example/index.ts"), "export {};");
      const plugin = githubActions({ projectRoot: root, metadataDir: "metadata", sourcesDir: "src", distributionDir: "actions" });
      expect(plugin.name).toBe("vite-github-actions");
      const config = plugin.config;
      if (typeof config !== "function") throw new Error("Expected Vite config function");
      const result = config.call({} as never, {} as never) as { build: { rollupOptions: { input: Record<string, string> } } };
      expect(result.build.rollupOptions.input.example).toBe(join(root, "src/example/index.ts"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("provides a Vite plugin", () => {
    expect(githubActions().name).toBe("vite-github-actions");
  });
});
