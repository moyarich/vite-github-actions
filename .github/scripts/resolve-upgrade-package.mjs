#!/usr/bin/env node
/** Resolve a dispatch package selector to an exact tracked workspace manifest. */
import { readFile, readdir, realpath } from "node:fs/promises";
import { relative, dirname, join, isAbsolute, sep } from "node:path";
import { appendFile } from "node:fs/promises";

const root = process.cwd();
const selector = (process.env.PACKAGE_SELECTOR || "all").trim();
const rootPkg = JSON.parse(await readFile("package.json", "utf8"));
const globs = rootPkg.workspaces?.packages || rootPkg.workspaces || [];
const manifests = ["package.json"];
for (const pattern of globs) {
  if (typeof pattern !== "string") continue;
  // npm workspaces commonly use package directories such as packages/* and apps/*.
  const base = pattern.replace(/\/*\*.*$/, "");
  if (!pattern.includes("*")) {
    manifests.push(join(pattern, "package.json"));
    continue;
  }
  if (!pattern.endsWith("/*"))
    throw new Error(`Unsupported workspace glob: ${pattern}`);
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (entry.isDirectory())
      manifests.push(join(base, entry.name, "package.json"));
  }
}
const candidates = [];
for (const manifest of new Set(manifests)) {
  try {
    const path = await realpath(manifest);
    const rel = relative(root, path);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) continue;
    const pkg = JSON.parse(await readFile(path, "utf8"));
    candidates.push({ path: manifest.replaceAll("\\", "/"), name: pkg.name });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
let target;
if (selector === "all") target = { kind: "all", manifest: "" };
else {
  const normalized = selector.replace(/^\.\//, "").replace(/\/$/, "");
  const matches = candidates.filter(
    ({ path, name }) =>
      selector === name ||
      normalized ===
        (path === "package.json" ? "." : dirname(path).replaceAll("\\", "/")) ||
      normalized === path ||
      (selector === "." && path === "package.json"),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Package selector ${JSON.stringify(selector)} matched ${matches.length} manifests. Use a full package name or workspace directory. Valid options: all, ., ${candidates.map((x) => x.name || dirname(x.path)).join(", ")}`,
    );
  }
  target = { kind: "single", manifest: matches[0].path };
}
await appendFile(
  process.env.GITHUB_OUTPUT,
  `kind=${target.kind}\nmanifest=${target.manifest}\nselector=${selector}\n`,
);
console.log(
  `Selected ${target.kind === "all" ? "all workspace manifests" : target.manifest}`,
);
