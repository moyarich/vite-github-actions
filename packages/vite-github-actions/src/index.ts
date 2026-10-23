import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import type { Plugin } from "vite";

/** Additional runtime files copied next to a generated action's metadata. */
export type ActionFiles = Record<string, Record<string, string>>;
/** A standalone action exposed as owner/repository@ref in GitHub Marketplace. */
export interface RepositoryActionOptions {
  /** JavaScript or TypeScript entrypoint, relative to repository root. */
  entry: string;
  /** Root metadata path, action.yml or action.yaml (default: action.yml). */
  metadataFile?: "action.yml" | "action.yaml";
  /** Compiled entry relative to repository root (default: dist/index.mjs). */
  main?: string;
}
export interface GithubActionsOptions {
  /** Build a single action with metadata at repository root. */
  repositoryAction?: RepositoryActionOptions;
  /** Legacy action metadata location (default: actions). */
  actionsDir?: string;
  /** Legacy directory scanned for source action entrypoints. */
  sourcesDir?: string;
  /** Vite intermediate bundle output (default: actions/dist). */
  outputDir?: string;
  target?: string;
  bundleDependencies?: boolean;
  validateMetadata?: boolean;
  /** Explicit action name -> JS/TS entrypoint, overriding discovery. */
  entries?: Record<string, string>;
  /** Source metadata directories; defaults to actionsDir. */
  metadataDir?: string;
  /** Generate action.yml and runtime files into distributionDir. Opt-in for compatibility. */
  generateDistributions?: boolean;
  /** Public action directory. When generation is enabled defaults to actionsDir. */
  distributionDir?: string;
  /** Runtime source file paths mapped to distribution-relative filenames by action. */
  runtimeFiles?: ActionFiles;
  /** Copy additional metadata files (e.g. README) from each source action directory. */
  copyMetadata?: boolean;
  /** Place JS bundles at <name>/index.mjs with shared chunks in _assets. */
  sharedChunks?: boolean;
  /** Per-action source filename discovery candidates (default index.ts, <name>-cli.ts). */
  entryNames?: string[];
  /** Skip discovery when explicit entries are supplied. */
  includeDiscovered?: boolean;
}
function inside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel))
  );
}
function safePath(base: string, path: string, label: string): string {
  const target = resolve(base, path);
  if (!inside(base, target))
    throw new Error(`${label} escapes base directory: ${path}`);
  return target;
}
function assertNoSymlinks(path: string, boundary: string): void {
  let current = path;
  while (inside(boundary, current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink())
      throw new Error("Refusing symlinked path: " + current);
    if (current === boundary) break;
    current = dirname(current);
  }
}
function copySafe(
  from: string,
  to: string,
  sourceBoundary: string,
  destBoundary: string,
): void {
  assertNoSymlinks(from, sourceBoundary);
  assertNoSymlinks(to, destBoundary);
  if (!existsSync(from))
    throw new Error("Missing distribution source: " + from);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, {
    recursive: true,
    filter(path) {
      if (lstatSync(path).isSymbolicLink())
        throw new Error("Refusing symlink in source: " + path);
      return true;
    },
  });
}
export function discoverActionEntries(
  sourcesDir: string,
  entryNames?: string[],
): Record<string, string> {
  const entries: Record<string, string> = {};
  if (!existsSync(sourcesDir))
    throw new Error("Actions source directory not found: " + sourcesDir);
  for (const entry of readdirSync(sourcesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const base = join(sourcesDir, entry.name);
    const file = (entryNames ?? ["index.ts", "{name}-cli.ts"])
      .map((name) => name.replaceAll("{name}", entry.name))
      .find((name) => existsSync(join(base, name)));
    if (!file) throw new Error("Missing action entry: " + base);
    entries[entry.name] = join(base, file);
  }
  if (!Object.keys(entries).length)
    throw new Error("No action entries discovered");
  return entries;
}

/**
 * Assemble a complete, replaceable distribution from metadata, Vite output,
 * and declared runtime files. Sources must be outside the generated tree.
 */
export function generateActionDistributions(
  options: GithubActionsOptions,
  names: string[],
  root = process.cwd(),
): void {
  const metadata = resolve(
    root,
    options.metadataDir ?? options.actionsDir ?? "actions",
  );
  const destination = resolve(
    root,
    options.distributionDir ?? options.actionsDir ?? "actions",
  );
  const bundles = resolve(root, options.outputDir ?? "actions/dist");
  if (
    !inside(root, metadata) ||
    !inside(root, destination) ||
    !inside(root, bundles)
  )
    throw new Error("Action paths must remain inside the project root");
  if (
    metadata === destination ||
    inside(destination, metadata) ||
    inside(destination, bundles)
  )
    throw new Error(
      "Authoritative metadata and staged bundles must be outside distributionDir",
    );
  if (inside(metadata, destination) || inside(bundles, destination))
    throw new Error(
      "Distribution directory must not overlap source/staging directories",
    );
  if (destination === root) throw new Error("Refusing to replace project root");
  assertNoSymlinks(destination, root);
  const stage = resolve(root, ".vite-github-actions-stage");
  if (
    !inside(root, stage) ||
    stage === destination ||
    inside(destination, stage) ||
    inside(stage, destination)
  )
    throw new Error("Unsafe distribution stage");
  assertNoSymlinks(stage, root);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  try {
    const sourceNames = readdirSync(metadata, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort();
    for (const name of sourceNames) {
      if (!/^[a-zA-Z][\w-]*$/.test(name))
        throw new Error("Invalid action directory: " + name);
      const sourceDir = join(metadata, name);
      const outputDir = join(stage, name);
      const metaFile = join(sourceDir, "action.yml");
      if (!existsSync(metaFile)) throw new Error("Missing action.yml: " + name);
      const yaml = readFileSync(metaFile, "utf8");
      mkdirSync(outputDir, { recursive: true });
      if (options.copyMetadata !== false)
        copySafe(sourceDir, outputDir, metadata, stage);
      else copySafe(metaFile, join(outputDir, "action.yml"), metadata, stage);
      const isNode = /^\s*using:\s*node(?:20|24)\s*$/m.test(yaml);
      const isComposite = /^\s*using:\s*composite\s*$/m.test(yaml);
      if (!isNode && !isComposite)
        throw new Error("Unsupported action runtime: " + name);
      if (names.includes(name)) {
        const bundleName = options.sharedChunks
          ? join(name, "index.mjs")
          : name + ".mjs";
        const src = join(bundles, bundleName);
        const main = isNode
          ? yaml.match(/^\s*main:\s*["']?([^\s"'#]+)["']?\s*$/m)?.[1]
          : undefined;
        const target = main ?? "index.mjs";
        copySafe(
          src,
          safePath(outputDir, target, "Action entry"),
          bundles,
          stage,
        );
      } else if (isNode) {
        const main = yaml.match(/^\s*main:\s*["']?([^\s"'#]+)["']?\s*$/m)?.[1];
        if (!main || !options.runtimeFiles?.[name]?.[main])
          throw new Error("Missing Node runtime mapping: " + name);
      }
      for (const [target, source] of Object.entries(
        options.runtimeFiles?.[name] ?? {},
      )) {
        const from = safePath(root, source, "Runtime file");
        copySafe(
          from,
          safePath(outputDir, target, "Runtime target"),
          root,
          stage,
        );
      }
      if (isNode) {
        const main = yaml.match(/^\s*main:\s*["']?([^\s"'#]+)["']?\s*$/m)?.[1];
        if (!main || !existsSync(safePath(outputDir, main, "Action main")))
          throw new Error("Missing built Node action entry: " + name);
      }
      for (const match of yaml.matchAll(/\$GITHUB_ACTION_PATH\/([\w.\/-]+)/g)) {
        if (!existsSync(safePath(outputDir, match[1], "Composite runtime")))
          throw new Error(
            "Missing composite action runtime: " + name + "/" + match[1],
          );
      }
    }
    for (const name of names) {
      if (!sourceNames.includes(name))
        throw new Error("Entry has no action metadata: " + name);
    }
    if (options.sharedChunks && existsSync(join(bundles, "_assets")))
      copySafe(
        join(bundles, "_assets"),
        join(stage, "_assets"),
        bundles,
        stage,
      );
    rmSync(destination, { recursive: true, force: true });
    renameSync(stage, destination);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}
export function githubActions(options: GithubActionsOptions = {}): Plugin {
  const root = process.cwd();
  const sources = resolve(root, options.sourcesDir ?? "src/actions");
  const output = resolve(
    root,
    options.outputDir ?? (options.repositoryAction ? "dist" : "actions/dist"),
  );
  const actions = resolve(
    root,
    options.metadataDir ?? options.actionsDir ?? "actions",
  );
  let names: string[] = [];
  return {
    name: "vite-github-actions",
    apply: "build",
    config() {
      if (options.repositoryAction) {
        if (
          options.generateDistributions ||
          options.entries ||
          options.includeDiscovered ||
          options.sharedChunks
        )
          throw new Error(
            "repositoryAction cannot be combined with monorepo distribution options",
          );
        const {
          entry,
          metadataFile = "action.yml",
          main = "dist/index.mjs",
        } = options.repositoryAction;
        const source = safePath(root, entry, "Repository action entry");
        if (!existsSync(source))
          throw new Error("Repository action entry not found: " + source);
        const metadataPath = resolve(root, metadataFile);
        if (!existsSync(metadataPath))
          throw new Error("Marketplace action requires root " + metadataFile);
        const yaml = readFileSync(metadataPath, "utf8");
        if (!/^\\s*using:\\s*node(?:20|24)\\s*$/m.test(yaml))
          throw new Error(
            "repositoryAction requires a Node.js action metadata runtime",
          );
        const declared = yaml.match(
          /^\\s*main:\\s*["']?([^\\s"'#]+)["']?\\s*$/m,
        )?.[1];
        if (!declared || declared !== main)
          throw new Error(
            `Root ${metadataFile} runs.main must reference ${main}`,
          );
        const dest = safePath(root, main, "Marketplace bundle output");
        const dir = dirname(dest);
        if (dir === root)
          throw new Error(
            "Marketplace bundle must be in a dedicated output directory",
          );
        if (options.outputDir && resolve(root, options.outputDir) !== dir)
          throw new Error(
            "outputDir must match the directory of repositoryAction.main",
          );
        return {
          ssr: {
            noExternal: options.bundleDependencies === false ? undefined : true,
          },
          build: {
            ssr: true,
            target: options.target ?? "node24",
            outDir: dir,
            emptyOutDir: true,
            minify: false,
            rollupOptions: {
              input: { action: source },
              output: { entryFileNames: win32.basename(dest) },
            },
          },
        };
      }
      const explicit = Object.fromEntries(
        Object.entries(options.entries ?? {}).map(([name, file]) => {
          const path = safePath(root, file, "Action entry");
          if (!existsSync(path))
            throw new Error("Action entry not found: " + path);
          return [name, path];
        }),
      );
      const discovered =
        options.entries && options.includeDiscovered !== true
          ? {}
          : discoverActionEntries(sources, options.entryNames);
      const entries = { ...discovered, ...explicit };
      names = Object.keys(entries);
      if (!names.length) throw new Error("No action entries configured");
      if (
        options.generateDistributions &&
        (options.outputDir ?? "actions/dist") ===
          (options.distributionDir ?? options.actionsDir ?? "actions")
      )
        throw new Error(
          "Bundle output and distribution cannot be the same directory",
        );
      if (
        !options.generateDistributions &&
        options.validateMetadata !== false
      ) {
        for (const name of names) {
          const metadata = join(actions, name, "action.yml");
          if (!existsSync(metadata)) continue;
          const yaml = readFileSync(metadata, "utf8");
          const expected = "../dist/" + name + ".mjs";
          if (!yaml.includes(expected))
            throw new Error(
              "Action metadata " + metadata + " must reference " + expected,
            );
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
            output: options.sharedChunks
              ? {
                  entryFileNames: "[name]/index.mjs",
                  chunkFileNames: "_assets/[name]-[hash].mjs",
                  assetFileNames: "_assets/[name]-[hash][extname]",
                }
              : { entryFileNames: "[name].mjs" },
          },
        },
      };
    },
    closeBundle() {
      if (options.generateDistributions && !options.repositoryAction)
        generateActionDistributions(options, names, root);
    },
  };
}
