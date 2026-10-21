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
export declare function discoverActionEntries(sourcesDir: string, entryNames?: string[]): Record<string, string>;
/**
 * Assemble a complete, replaceable distribution from metadata, Vite output,
 * and declared runtime files. Sources must be outside the generated tree.
 */
export declare function generateActionDistributions(options: GithubActionsOptions, names: string[], root?: string): void;
export declare function githubActions(options?: GithubActionsOptions): Plugin;
