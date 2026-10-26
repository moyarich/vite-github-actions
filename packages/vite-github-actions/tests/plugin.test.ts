import { describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { githubActions } from "../src/index";

function fixture(
  run: (
    root: string,
    write: (path: string, value: string) => void,
  ) => Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), "vite-actions-"));
  const write = (path: string, value: string) => {
    const file = join(root, path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, value);
  };
  return run(root, write).finally(() =>
    rmSync(root, { recursive: true, force: true }),
  );
}

describe("generic Vite builds and copies", () => {
  it("builds arbitrary entry filenames to requested paths", async () => {
    await fixture(async (root, write) => {
      write("packages/implementation/custom-start.ts", "console.log('built');");
      await build({
        configFile: false,
        plugins: [
          githubActions({
            root: root,
            build: { input: [
              {
                from: "packages/implementation/*.ts",
                to: "generated/{name}.mjs",
              },
            ] },
          }),
        ],
      });
      expect(
        readFileSync(join(root, "generated/custom-start.mjs"), "utf8"),
      ).toContain("built");
    });
  });

  it("copies files without inspecting metadata names or contents", async () => {
    await fixture(async (root, write) => {
      write("definitions/tool/anything.yaml", "arbitrary: metadata");
      write("definitions/tool/README.md", "Documentation");
      await build({
        configFile: false,
        plugins: [
          githubActions({
            root: root,
            copy: [{ from: "definitions/**/*", to: "generated/" }],
          }),
        ],
      });
      expect(
        readFileSync(join(root, "generated/tool/anything.yaml"), "utf8"),
      ).toBe("arbitrary: metadata");
      expect(readFileSync(join(root, "generated/tool/README.md"), "utf8")).toBe(
        "Documentation",
      );
    });
  });

  it("rejects overlapping destination mappings", () => {
    const root = mkdtempSync(join(tmpdir(), "vite-collision-"));
    try {
      mkdirSync(join(root, "one"), { recursive: true });
      mkdirSync(join(root, "two"), { recursive: true });
      writeFileSync(join(root, "one/input.json"), "{}");
      writeFileSync(join(root, "two/input.json"), "{}");
      const plugin = githubActions({
        root: root,
        copy: [
          { from: "one/*.json", to: "out/input.json" },
          { from: "two/*.json", to: "out/input.json" },
        ],
      });
      const config = plugin.config;
      if (typeof config !== "function") throw new Error("Missing config hook");
      expect(() =>
        config.call({} as never, {} as never, {
          command: "build",
          mode: "production",
        }),
      ).toThrow(/Duplicate destination/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
