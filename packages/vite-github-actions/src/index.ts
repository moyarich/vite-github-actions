import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Plugin } from "vite";

export interface GithubActionsOptions {
  actionsDir?: string;
  sourcesDir?: string;
  outputDir?: string;
  target?: string;
  bundleDependencies?: boolean;
  validateMetadata?: boolean;
}
export function discoverActionEntries(
  sourcesDir: string,
): Record<string, string> {
  const entries: Record<string, string> = {};
  if (!existsSync(sourcesDir))
    throw new Error("Actions source directory not found: " + sourcesDir);
  for (const entry of readdirSync(sourcesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const base = join(sourcesDir, entry.name);
    const file = ["index.ts", entry.name + "-cli.ts"].find((name) =>
      existsSync(join(base, name)),
    );
    if (!file) throw new Error("Missing TypeScript action entry: " + base);
    entries[entry.name] = join(base, file);
  }
  if (!Object.keys(entries).length)
    throw new Error("No TypeScript actions discovered");
  return entries;
}
export function githubActions(options: GithubActionsOptions = {}): Plugin {
  const sources = resolve(options.sourcesDir ?? "src/actions");
  const output = resolve(options.outputDir ?? "actions/dist");
  const actions = resolve(options.actionsDir ?? "actions");
  return {
    name: "vite-github-actions",
    apply: "build",
    config() {
      const entries = discoverActionEntries(sources);
      if (options.validateMetadata !== false) {
        for (const name of Object.keys(entries)) {
          const metadata = join(actions, name, "action.yml");
          // Some actions are invoked only by reusable workflows, not action.yml.
          if (!existsSync(metadata)) continue;
        }
      }
      return {
        ssr: {
          noExternal: options.bundleDependencies === false ? undefined : true,
        },
        build: {
          ssr: true,
          target: options.target ?? "node24",
          outDir: output,
          emptyOutDir: true,
          minify: false,
          rollupOptions: {
            input: entries,
            output: { entryFileNames: "[name].mjs" },
          },
        },
      };
    },
  };
}
