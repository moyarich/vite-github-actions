import { describe, expect, it } from "vitest";
import { githubActions } from "../src/index";

describe("build and copy configuration", () => {
  it("exposes a Vite build plugin", () => {
    const plugin = githubActions({
      builds: [{ from: "src/**/*.ts", to: "dist/{name}.mjs" }],
      copies: [{ from: "assets/**/*", to: "dist/" }],
    });
    expect(plugin.name).toBe("vite-github-actions");
    expect(plugin.apply).toBe("build");
  });
});
