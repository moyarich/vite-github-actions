import { describe, expect, it } from "vitest";
import { githubActions } from "../src/index";

describe("build and copy configuration", () => {
  it("exposes a Vite build plugin", () => {
    const plugin = githubActions({
      build: { input: [{ from: "src/**/*.ts", to: "dist/{name}.mjs" }] },
      copy: [{ from: "assets/**/*", to: "dist/" }],
    });
    expect(plugin.name).toBe("vite-github-actions");
    expect(plugin.apply).toBe("build");
  });
});
