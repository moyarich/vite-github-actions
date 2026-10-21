import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { githubActions } from "../src/index";

describe("standalone repository actions", () => {
  it("provides a separate root action configuration", () => {
    const root = mkdtempSync(join(tmpdir(), "marketplace-action-"));
    const previous = process.cwd();
    try {
      process.chdir(root);
      mkdirSync("src");
      writeFileSync("src/index.ts", "console.log('action')");
      writeFileSync(
        "action.yml",
        "name: My Action\nruns:\n  using: node24\n  main: dist/index.mjs\n",
      );
      const plugin = githubActions({
        repositoryAction: { entry: "src/index.ts" },
      });
      const config = plugin.config;
      if (typeof config !== "function") throw new Error("Missing config hook");
      const result = config.call({} as never, {} as never, {} as never) as {
        build?: { outDir?: string };
      };
      expect(result.build?.outDir).toBe(join(root, "dist"));
    } finally {
      process.chdir(previous);
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects a mismatch between metadata and output", () => {
    const root = mkdtempSync(join(tmpdir(), "marketplace-action-"));
    const previous = process.cwd();
    try {
      process.chdir(root);
      mkdirSync("src");
      writeFileSync("src/index.ts", "export {}");
      writeFileSync(
        "action.yml",
        "name: My Action\nruns:\n  using: node24\n  main: wrong/file.mjs\n",
      );
      const config = githubActions({
        repositoryAction: { entry: "src/index.ts" },
      }).config;
      if (typeof config !== "function") throw new Error("Missing config hook");
      expect(() => config.call({} as never, {} as never, {} as never)).toThrow(
        /runs.main/,
      );
    } finally {
      process.chdir(previous);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
