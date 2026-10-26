import { describe, expect, it } from "vitest";
import {
  existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateActionDistributions } from "../src/index";

describe("generated action distributions", () => {
  it("assembles Node bundles and discovers composite scripts and schemas", () => {
    const root = mkdtempSync(join(tmpdir(), "github-actions-auto-"));
    try {
      const write = (path: string, contents: string) => {
        const file = join(root, path);
        mkdirSync(join(file, ".."), { recursive: true });
        writeFileSync(file, contents);
      };
      write("metadata/example/action.yml", "name: Example\nruns:\n  using: node24\n  main: index.mjs\n");
      write("metadata/composite/action.yml", 'name: Composite\nruns:\n  using: composite\n  steps:\n    - shell: bash\n      run: node "$GITHUB_ACTION_PATH/index.mjs"\n');
      write("src/composite/index.ts", "const answer: number = 42; console.log(answer);");
      write("src/composite/schemas/config.json", '{"type":"object"}');
      write("bundles/example/index.mjs", "console.log('example');");
      write("bundles/_assets/chunk.mjs", "export {};");
      const options = {
        metadataDir: "metadata", sourcesDir: "src", outputDir: "bundles",
        distributionDir: "actions", sharedChunks: true,
        assets: ["**/*.json"],
      };
      generateActionDistributions(options, ["example"], root);
      expect(readFileSync(join(root, "actions/example/index.mjs"), "utf8")).toContain("example");
      expect(readFileSync(join(root, "actions/composite/index.mjs"), "utf8")).toContain("42");
      expect(readFileSync(join(root, "actions/composite/schemas/config.json"), "utf8")).toBe('{"type":"object"}');
      expect(existsSync(join(root, "actions/_assets/chunk.mjs"))).toBe(true);
      rmSync(join(root, "actions"), { recursive: true, force: true });
      generateActionDistributions(options, ["example"], root);
      expect(existsSync(join(root, "actions/composite/action.yml"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("refuses to replace source metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "github-actions-safe-"));
    try {
      mkdirSync(join(root, "actions"), { recursive: true });
      expect(() => generateActionDistributions({
        metadataDir: "actions", distributionDir: "actions", outputDir: "bundles",
      }, [], root)).toThrow(/outside distributionDir/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
