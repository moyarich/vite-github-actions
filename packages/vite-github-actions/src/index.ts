import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
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
import {
  transpileModule,
  ModuleKind,
  ScriptTarget,
  DiagnosticCategory,
  flattenDiagnosticMessageText,
} from "typescript";

/** A standalone action exposed as owner/repository@ref in GitHub Marketplace. */
export interface RepositoryActionOptions {
  /** JavaScript or TypeScript entrypoint, relative to repository root. */
  entry: string;
  /** Root metadata path, action.yml or action.yaml (default: action.yml). */
  metadataFile?: string;
  /** Compiled entry relative to repository root (default: dist/index.mjs). */
  main?: string;
}
export interface GithubActionsOptions {
  /** Root for action paths, relative to the invocation directory (default: process.cwd()). */
  projectRoot?: string;
  /** Build a single action with metadata at repository root. */
  repositoryAction?: RepositoryActionOptions;
  /** Legacy directory scanned for source action entrypoints. */
  sourcesDir?: string;
  /** Vite intermediate bundle output (default: actions/dist). */
  outputDir?: string;
  target?: string;
  bundleDependencies?: boolean;
  validateMetadata?: boolean;
  /** Configurable metadata filename inside each action directory. */
  metadataFile?: string;
  /** Source metadata directories. */
  metadataDir?: string;
  /** Public action directory. When generation is enabled defaults to actionsDir. */
  distributionDir?: string;
  /** Copy additional metadata files (e.g. README) from each source action directory. */
  copyMetadata?: boolean;
  /** Place JS bundles at <name>/index.mjs with shared chunks in _assets. */
  sharedChunks?: boolean;
  /** Per-action source filename discovery candidates (default index.ts, <name>-cli.ts). */
  entryNames?: string[];
  /** Glob patterns for colocated assets, including nested JSON files. */
  assets?: string[];
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
function discoverMetadataEntries(
  root: string,
  options: GithubActionsOptions,
): Record<string, string> {
  const metadataDir = resolve(root, options.metadataDir ?? "actions");
  const sourceDir = resolve(root, options.sourcesDir ?? "src/actions");
  const result: Record<string, string> = {};
  for (const item of readdirSync(metadataDir, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const yamlPath = join(
      metadataDir,
      item.name,
      options.metadataFile ?? "action.yml",
    );
    if (!existsSync(yamlPath)) continue;
    const yaml = readFileSync(yamlPath, "utf8");
    if (!yaml.includes("using: node24") && !yaml.includes("using: node20"))
      continue;
    const candidates = (
      options.entryNames ?? [
        "action-entry.ts",
        "entry.ts",
        "index.ts",
        "{name}.ts",
        "{name}-cli.ts",
      ]
    ).map((name) => name.replaceAll("{name}", item.name));
    const entry = candidates.find(
      (file) =>
        inside(root, resolve(sourceDir, file)) &&
        existsSync(resolve(sourceDir, file)),
    );
    if (!entry) throw new Error("Missing Node action entry: " + item.name);
    result[item.name] = resolve(sourceDir, entry);
  }
  return result;
}
function collectedFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = join(dir, item.name);
    if (item.isSymbolicLink()) throw new Error("Refusing symlink: " + full);
    return item.isDirectory()
      ? collectedFiles(full, base)
      : item.isFile()
        ? [relative(base, full).split(sep).join("/")]
        : [];
  });
}
function assetMatch(pattern: string, file: string): boolean {
  if (pattern.startsWith("**/"))
    return (
      assetMatch(pattern.slice(3), file) ||
      file
        .split("/")
        .some((_, i, parts) =>
          assetMatch(pattern.slice(3), parts.slice(i).join("/")),
        )
    );
  if (pattern.startsWith("*."))
    return !file.includes("/") && file.endsWith(pattern.slice(1));
  return pattern === file;
}
function autoFiles(
  root: string,
  options: GithubActionsOptions,
  name: string,
  yaml: string,
): Record<string, string> {
  const dir = resolve(root, options.sourcesDir ?? "src/actions", name);
  const available = collectedFiles(dir);
  const result: Record<string, string> = {};
  for (const match of yaml.matchAll(/\$GITHUB_ACTION_PATH\/([\w./-]+)/g)) {
    const target = match[1];
    const candidates = [target, target.replace(/\.(mjs|js|cjs)$/, ".ts")];
    const source = candidates.find((file) => available.includes(file));
    if (source)
      result[target] = relative(root, join(dir, source)).split(sep).join("/");
  }
  for (const file of available) {
    if ((options.assets ?? []).some((pattern) => assetMatch(pattern, file)))
      result[file] ??= relative(root, join(dir, file)).split(sep).join("/");
  }
  return result;
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
  const metadata = resolve(root, options.metadataDir ?? "actions");
  const destination = resolve(root, options.distributionDir ?? "actions");
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
      const metaFile = join(sourceDir, options.metadataFile ?? "action.yml");
      if (!existsSync(metaFile))
        throw new Error("Missing action metadata: " + name);
      const yaml = readFileSync(metaFile, "utf8");
      mkdirSync(outputDir, { recursive: true });
      if (options.copyMetadata !== false)
        copySafe(sourceDir, outputDir, metadata, stage);
      else
        copySafe(
          metaFile,
          join(outputDir, options.metadataFile ?? "action.yml"),
          metadata,
          stage,
        );
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
        if (!main || !autoFiles(root, options, name, yaml)[main])
          throw new Error("Missing Node runtime mapping: " + name);
      }
      for (const [target, source] of Object.entries({
        ...autoFiles(root, options, name, yaml),
      })) {
        const from = safePath(root, source, "Runtime file");
        const destinationFile = safePath(outputDir, target, "Runtime target");
        if (
          from.endsWith(".ts") ||
          from.endsWith(".mts") ||
          from.endsWith(".cts") ||
          from.endsWith(".tsx")
        ) {
          if (!/\.(?:mjs|cjs|js)$/.test(target))
            throw new Error(
              "TypeScript runtime target must be a JavaScript file: " + target,
            );
          assertNoSymlinks(from, root);
          assertNoSymlinks(destinationFile, stage);
          const result = transpileModule(readFileSync(from, "utf8"), {
            fileName: from,
            compilerOptions: {
              module: target.endsWith(".cjs")
                ? ModuleKind.CommonJS
                : ModuleKind.ESNext,
              target: ScriptTarget.ES2022,
            },
            reportDiagnostics: true,
          });
          const errors = (result.diagnostics ?? []).filter(
            (d) => d.category === DiagnosticCategory.Error,
          );
          if (errors.length)
            throw new Error(
              "TypeScript runtime transpilation failed: " +
                source +
                ": " +
                errors
                  .map((d) => flattenDiagnosticMessageText(d.messageText, "\n"))
                  .join("; "),
            );
          mkdirSync(dirname(destinationFile), { recursive: true });
          writeFileSync(destinationFile, result.outputText);
        } else {
          copySafe(from, destinationFile, root, stage);
        }
      }
      if (isNode) {
        const main = yaml.match(/^\s*main:\s*["']?([^\s"'#]+)["']?\s*$/m)?.[1];
        if (!main || !existsSync(safePath(outputDir, main, "Action main")))
          throw new Error("Missing built Node action entry: " + name);
      }
      for (const match of yaml.matchAll(
        /\$GITHUB_ACTION_PATH\/([\w.\x2f-]+)/g,
      )) {
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
  const root = resolve(process.cwd(), options.projectRoot ?? ".");
  const output = resolve(
    root,
    options.outputDir ?? (options.repositoryAction ? "dist" : "actions/dist"),
  );
  let names: string[] = [];
  return {
    name: "vite-github-actions",
    apply: "build",
    config() {
      if (options.repositoryAction) {
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
        if (!/^\s*using:\s*node(?:20|24)\s*$/m.test(yaml))
          throw new Error(
            "repositoryAction requires a Node.js action metadata runtime",
          );
        const declared = yaml.match(
          /^\s*main:\s*["']?([^\s"'#]+)["']?\s*$/m,
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
      const entries = discoverMetadataEntries(root, options);
      names = Object.keys(entries);
      if (!names.length) throw new Error("No action entries configured");
      if (
        (options.outputDir ?? "actions/dist") ===
        (options.distributionDir ?? "actions")
      )
        throw new Error(
          "Bundle output and distribution cannot be the same directory",
        );
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
      if (!options.repositoryAction)
        generateActionDistributions(options, names, root);
    },
  };
}
