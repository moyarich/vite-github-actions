import {
  cpSync,
  existsSync,
  globSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  rmSync,
  statSync,
} from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type { Plugin } from "vite";

/** A file glob and destination template, relative to projectRoot. */
export interface FileMapping {
  from: string;
  /** Destination file or directory. Supports {name}, {parent}, and {relative}. */
  to: string;
}

export interface GithubActionsOptions {
  /** Base directory for source and destination paths. Defaults to the Vite invocation directory. */
  projectRoot?: string;
  /** Source files to bundle using Vite. */
  builds?: FileMapping[];
  /** Files to copy without changing their contents. */
  copies?: FileMapping[];
  /** Node build target. */
  target?: string;
  /** Bundle imported packages, rather than leaving them external. */
  bundleDependencies?: boolean;
}

interface ResolvedFile {
  source: string;
  destination: string;
}

function within(root: string, value: string): boolean {
  const rel = relative(root, value);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel))
  );
}

function safe(root: string, value: string): string {
  const full = resolve(root, value);
  if (!within(root, full))
    throw new Error("Path escapes projectRoot: " + value);
  return full;
}

function globBase(pattern: string): string {
  const prefix = pattern.split(/[?*[{]/, 1)[0];
  return prefix.endsWith("/") ? prefix.slice(0, -1) : dirname(prefix);
}

function mappingFiles(root: string, mappings: FileMapping[]): ResolvedFile[] {
  const results: ResolvedFile[] = [];
  for (const mapping of mappings) {
    const prefix = safe(root, globBase(mapping.from));
    const names = globSync(mapping.from, { cwd: root }).sort();
    if (!names.length) throw new Error("No files match: " + mapping.from);
    for (const file of names) {
      const source = safe(root, file);
      if (lstatSync(source).isSymbolicLink())
        throw new Error("Symlink source not supported: " + source);
      if (!statSync(source).isFile()) continue;
      const name = basename(source, extname(source));
      const parent = basename(dirname(source));
      const remainder = relative(prefix, source).split(sep).join("/");
      const destinationTemplate = mapping.to
        .replaceAll("{name}", name)
        .replaceAll("{parent}", parent)
        .replaceAll("{relative}", remainder);
      const destination =
        destinationTemplate.includes("{") && destinationTemplate.includes("}")
          ? (() => {
              throw new Error(
                "Unknown destination placeholder: " + destinationTemplate,
              );
            })()
          : safe(
              root,
              mapping.to.endsWith("/") || !extname(destinationTemplate)
                ? join(destinationTemplate, remainder)
                : destinationTemplate,
            );
      results.push({ source, destination });
    }
  }
  return results;
}

function assertDistinct(files: ResolvedFile[]): void {
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.destination))
      throw new Error("Duplicate destination: " + file.destination);
    seen.add(file.destination);
  }
}

export function githubActions(options: GithubActionsOptions = {}): Plugin {
  const root = resolve(process.cwd(), options.projectRoot ?? ".");
  const staging = safe(root, ".vite-github-actions-build");
  let built: ResolvedFile[] = [];
  let copied: ResolvedFile[] = [];
  let outputNames: Record<string, string> = {};
  return {
    name: "vite-github-actions",
    apply: "build",
    resolveId(id) {
      if (id === "virtual:vite-github-actions-copy-only")
        return "\\0vite-github-actions:copy-only";
      return null;
    },
    load(id) {
      if (id === "\\0vite-github-actions:copy-only") return "export {};";
      return null;
    },
    config() {
      built = mappingFiles(root, options.builds ?? []);
      copied = mappingFiles(root, options.copies ?? []);
      assertDistinct([...built, ...copied]);
      if (!built.length && !copied.length)
        throw new Error("Provide builds or copies");
      outputNames = Object.fromEntries(
        built.map((entry, index) => [String(index), entry.source]),
      );
      if (!built.length)
        return {
          build: {
            outDir: staging,
            emptyOutDir: true,
            rollupOptions: {
              input: { __copy_only__: "virtual:vite-github-actions-copy-only" },
            },
          },
        };
      return {
        ssr: {
          noExternal: options.bundleDependencies === false ? undefined : true,
        },
        build: {
          ssr: true,
          target: options.target ?? "node24",
          outDir: staging,
          emptyOutDir: true,
          minify: false,
          rollupOptions: {
            input: outputNames,
            output: {
              entryFileNames: (chunk: { name: string }) => {
                const item = built[Number(chunk.name)];
                if (!item)
                  throw new Error("Unknown build entry: " + chunk.name);
                return relative(root, item.destination).split(sep).join("/");
              },
              chunkFileNames: "_chunks/[name]-[hash].mjs",
              assetFileNames: "_assets/[name]-[hash][extname]",
            },
          },
        },
      };
    },
    closeBundle() {
      for (const file of copied) {
        if (file.source === file.destination) continue;
        mkdirSync(dirname(file.destination), { recursive: true });
        cpSync(file.source, file.destination);
      }
      if (built.length) {
        const copyBuildTree = (directory: string): void => {
          for (const item of readdirSync(directory, { withFileTypes: true })) {
            const source = join(directory, item.name);
            if (item.isSymbolicLink())
              throw new Error("Symlink in generated files: " + source);
            if (item.isDirectory()) copyBuildTree(source);
            else if (item.isFile()) {
              const destination = safe(root, relative(staging, source));
              mkdirSync(dirname(destination), { recursive: true });
              cpSync(source, destination);
            }
          }
        };
        try {
          copyBuildTree(staging);
        } finally {
          rmSync(staging, { recursive: true, force: true });
        }
      } else if (existsSync(staging)) {
        rmSync(staging, { recursive: true, force: true });
      }
    },
  };
}
