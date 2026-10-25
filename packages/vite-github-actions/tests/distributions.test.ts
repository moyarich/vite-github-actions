import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateActionDistributions } from "../src/index";

describe("generated action distributions", () => {
  it("supports Node and composite actions and recreates deleted output", () => {
    const root = mkdtempSync(join(tmpdir(), "github-actions-"));
    try {
      const write = (path: string, content: string) => {
        const file = join(root, path);
        mkdirSync(join(file, ".."), { recursive: true });
        writeFileSync(file, content);
      };
      write(
        "metadata/example/action.yml",
        "name: Example\nruns:\n  using: node24\n  main: index.mjs\n",
      );
      write(
        "metadata/composite/action.yml",
        'name: Composite\nruns:\n  using: composite\n  steps:\n    - shell: bash\n      run: node "$GITHUB_ACTION_PATH/run.mjs"\n',
      );
      write("bundles/example/index.mjs", "console.log('example')");
      write("bundles/_assets/chunk.mjs", "export {};");
      write("runtime/run.mjs", "console.log('composite')");
      const options = {
        metadataDir: "metadata",
        distributionDir: "actions",
        outputDir: "bundles",
        sharedChunks: true,
        runtimeFiles: { composite: { "run.mjs": "runtime/run.mjs" } },
      };
      generateActionDistributions(options, ["example"], root);
      expect(
        readFileSync(join(root, "actions/example/index.mjs"), "utf8"),
      ).toContain("example");
      expect(existsSync(join(root, "actions/composite/run.mjs"))).toBe(true);
      expect(existsSync(join(root, "actions/_assets/chunk.mjs"))).toBe(true);
      rmSync(join(root, "actions"), { recursive: true, force: true });
      generateActionDistributions(options, ["example"], root);
      expect(existsSync(join(root, "actions/example/action.yml"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("transpiles tracked TypeScript runtime files and preserves non-TypeScript assets", () => {
    const root = mkdtempSync(join(tmpdir(), "github-actions-ts-"));
    try {
      const write = (path: string, content: string) => {
        const file = join(root, path);
        mkdirSync(join(file, ".."), { recursive: true });
        writeFileSync(file, content);
      };
      write(
        "metadata/composite/action.yml",
        'name: Composite\nruns:\n  using: composite\n  steps:\n    - shell: bash\n      run: node "$GITHUB_ACTION_PATH/run.mjs"\n',
      );
      write("runtime/run.ts", "const value: number = 42; console.log(value);");
      write("runtime/legacy.cts", "const value: number = 3; module.exports = value;");
      write("runtime/schema.json", '{"ok":true}');
      const config = {
        metadataDir: "metadata",
        outputDir: "bundles",
        distributionDir: "actions",
        runtimeFiles: {
          composite: {
            "run.mjs": "runtime/run.ts",
            "legacy.cjs": "runtime/legacy.cts",
            "schema.json": "runtime/schema.json",
          },
        },
      };
      generateActionDistributions(config, [], root);
      expect(readFileSync(join(root, "actions/composite/run.mjs"), "utf8")).not.toContain(": number");
      expect(readFileSync(join(root, "actions/composite/run.mjs"), "utf8")).toContain("42");
      expect(readFileSync(join(root, "actions/composite/legacy.cjs"), "utf8")).not.toContain(": number");
      expect(readFileSync(join(root, "actions/composite/schema.json"), "utf8")).toBe('{"ok":true}');
      expect(() =>
        generateActionDistributions(
          { ...config, runtimeFiles: { composite: { "not-typescript.ts": "runtime/run.ts" } } },
          [],
          root,
        ),
      ).toThrow(/TypeScript runtime target must be a JavaScript file/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("prevents replacing the metadata source", () => {
    const root = mkdtempSync(join(tmpdir(), "github-actions-"));
    try {
      mkdirSync(join(root, "actions"), { recursive: true });
      expect(() =>
        generateActionDistributions(
          {
            metadataDir: "actions",
            distributionDir: "actions",
            outputDir: "bundles",
          },
          [],
          root,
        ),
      ).toThrow(/outside distributionDir/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
