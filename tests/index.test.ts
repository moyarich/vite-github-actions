import { describe, expect, it } from "vitest";
import { greet } from "../src/index.js";

describe("template", () => {
  it("runs Vitest", () => {
    expect(greet("world")).toBe("Hello, world!");
  });
});
