import {
  cpSync,
  existsSync,
  globSync,
  mkdirSync,
  renameSync,
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
    const names = globSync(mapping.from, { cwd: root, nodir: true }).sort();
    if (!names.length) throw new Error("No files match: " + mapping.from);
    for (const file of names) {
      const source = safe(root, file);
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
        return { build: { write: false, rollupOptions: { input: {} } } };
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
              entryFileNames: "[name].mjs",
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
      for (const [index, file] of built.entries()) {
        const from = join(staging, index + ".mjs");
        if (!existsSync(from)) throw new Error("Missing built entry: " + from);
        mkdirSync(dirname(file.destination), { recursive: true });
        cpSync(from, file.destination);
      }
      if (built.length) {
        // Chunked output needs to remain adjacent to the entry files. Each entry
        // is bundled independently in a follow-up if cross-directory chunks exist.
        rmSync(staging, { recursive: true, force: true });
      }
    },
  };
}
