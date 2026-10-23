#!/usr/bin/env node
/**
 * Capture baseline dependency declarations and write a GitHub Actions summary.
 * This script deliberately reads manifests rather than parsing npm-check-updates
 * terminal output, so it includes workspace and dependency-type information.
 */
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const groups = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const stateFile =
  process.env.DEP_UPGRADE_STATE ||
  resolve(process.env.RUNNER_TEMP || ".", "dependency-upgrade-before.json");
const mode = process.argv[2];

function manifestFiles() {
  return execFileSync(
    "git",
    ["ls-files", "-z", "--", "**/package.json", "package.json"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .sort();
}
async function loadManifest(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}
function markdown(value) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replace(/[\r\n]+/g, " ")
    .replaceAll("`", "\\`");
}
/** Classify changes to the declared version, without claiming compatibility for non-semver specs. */
function changeLevel(previous, updated) {
  const parse = (spec) => {
    const match = String(spec).match(
      /^[~^=v\\s]*([0-9]+)\\.([0-9]+)\\.([0-9]+)(?:[-+][^\\s]+)?$/,
    );
    return match ? match.slice(1, 4).map(Number) : null;
  };
  const from = parse(previous);
  const to = parse(updated);
  if (!from || !to) return "Other / range change";
  if (to[0] !== from[0]) return "Major";
  if (to[1] !== from[1]) return from[0] === 0 ? "Major-zero minor" : "Minor";
  if (to[2] !== from[2]) return "Patch";
  return "Range / prerelease";
}
function status(value) {
  return (
    {
      success: "✅ Passed",
      failure: "❌ Failed",
      skipped: "⏭️ Skipped",
      cancelled: "⚠️ Cancelled",
    }[value] || "—"
  );
}
if (mode === "snapshot") {
  const manifests = {};
  for (const file of manifestFiles())
    manifests[file] = await loadManifest(file);
  await writeFile(stateFile, JSON.stringify(manifests));
} else if (mode === "report") {
  let before = {};
  try {
    before = JSON.parse(await readFile(stateFile, "utf8"));
  } catch {
    /* snapshot could fail */
  }
  const changes = [];
  for (const file of new Set([...Object.keys(before), ...manifestFiles()])) {
    const oldPackage = before[file] || {};
    const newPackage = (await loadManifest(file)) || {};
    for (const type of groups) {
      const previous = oldPackage[type] || {};
      const current = newPackage[type] || {};
      for (const dependency of new Set([
        ...Object.keys(previous),
        ...Object.keys(current),
      ])) {
        if (previous[dependency] !== current[dependency]) {
          changes.push({
            file,
            type,
            dependency,
            before: previous[dependency] || "—",
            after: current[dependency] || "—",
            level: changeLevel(previous[dependency], current[dependency]),
          });
        }
      }
    }
  }
  const failed = ["selection", "upgrade", "install", "commit"].filter(
    (x) => process.env[`RESULT_${x.toUpperCase()}`] === "failure",
  );
  const runUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY || ""}/actions/runs/${process.env.GITHUB_RUN_ID || ""}`;
  const lines = [
    "# Workspace dependency upgrade",
    "",
    `**Outcome:** ${failed.length ? "❌ Failed" : process.env.RESULT_COMMIT === "success" ? "✅ Completed" : "⚠️ Incomplete"} · **Branch:** \`${markdown(process.env.GITHUB_REF_NAME)}\` · **Changes:** ${changes.length}`,
    "",
    `**Excluded packages:** \`${markdown(process.env.REJECT || "(none)")}\``,
    "",
    `**Selected package:** \`${markdown(process.env.PACKAGE_SELECTOR || "all")}\``,
    "",
    "## Stages",
    "| Stage | Result |",
    "| --- | --- |",
    `| Package selection | ${status(process.env.RESULT_SELECTION)} |`,
    `| Upgrade declarations | ${status(process.env.RESULT_UPGRADE)} |`,
    `| Install and lockfile | ${status(process.env.RESULT_INSTALL)} |`,
    `| Commit and push | ${status(process.env.RESULT_COMMIT)} |`,
    "",
    "## Dependency changes",
  ];
  if (changes.length) {
    const counts = new Map();
    for (const { level } of changes)
      counts.set(level, (counts.get(level) || 0) + 1);
    lines.push(
      "### Version-change overview",
      "",
      "| Category | Declarations |",
      "| --- | ---: |",
    );
    for (const [category, count] of counts)
      lines.push(`| ${markdown(category)} | ${count} |`);
    lines.push("");
    const byFile = new Map();
    for (const change of changes) {
      if (!byFile.has(change.file)) byFile.set(change.file, []);
      byFile.get(change.file).push(change);
    }
    lines.push(
      `**${byFile.size} manifest(s), ${changes.length} dependency declaration(s) changed.**`,
      "",
    );
    for (const [file, items] of byFile) {
      lines.push(
        `<details><summary>${markdown(file)} — ${items.length} change(s)</summary>`,
        "",
        "| Dependency | Type | Category | Previous | Updated |",
        "| --- | --- | --- | --- | --- |",
      );
      for (const item of items)
        lines.push(
          `| ${markdown(item.dependency)} | ${markdown(item.type)} | ${markdown(item.level)} | ${markdown(item.before)} | ${markdown(item.after)} |`,
        );
      lines.push("", "</details>", "");
    }
  } else {
    lines.push(
      "No dependency declaration changes detected. This can mean dependencies are current or the upgrade stopped before changing manifests.",
      "",
    );
  }
  lines.push(
    "## Git result",
    process.env.GIT_RESULT || "No commit or push result was recorded.",
    "",
  );
  if (failed.length)
    lines.push(
      `**Failed stage(s):** ${failed.join(", ")}. [Inspect workflow logs](${runUrl}).`,
      "",
    );
  lines.push(`[View this workflow run](${runUrl})`, "");
  const summary = lines.join("\n");
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  else process.stdout.write(summary);
} else {
  throw new Error("Expected 'snapshot' or 'report'");
}
