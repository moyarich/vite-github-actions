import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverActionEntries, githubActions } from "../src/index";
describe("vite-github-actions", () => {
  it("discovers action entry points", () => {
    const root = mkdtempSync(join(tmpdir(), "vite-actions-"));
    try {
      mkdirSync(join(root, "example"));
      writeFileSync(join(root, "example", "index.ts"), "export {};");
      expect(discoverActionEntries(root)).toEqual({ example: join(root, "example", "index.ts") });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("provides a Vite plugin", () => {
    expect(githubActions().name).toBe("vite-github-actions");
  });
});
