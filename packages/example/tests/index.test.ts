import { expect, it } from "vitest";
import { greet } from "../src/index";

it("greets by name", () => {
  expect(greet("monorepo")).toBe("Hello, monorepo!");
});
