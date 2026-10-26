# @moyarich/vite-github-actions

A generic Vite plugin to build JavaScript/TypeScript files and copy other files into destinations you specify. **It does not inspect GitHub Actions metadata or assume particular filenames or repository layouts.**

## Usage

```ts
import { defineConfig } from "vite";
import { githubActions } from "@moyarich/vite-github-actions";

export default defineConfig({
  plugins: [
    githubActions({
      root: "../..",
      build: { input: [
        {
          from: "packages/cli/src/*/action-entry.ts",
          to: "actions/{parent}/index.mjs",
        },
      ] },
      copy: [
        { from: "packages/actions/actions/**/*", to: "actions/" },
        { from: "packages/cli/src/**/*.json", to: "actions/" },
      ],
    }),
  ],
});
```

The directory names above belong to the example consumer, not the plugin. Neither `action.yml` nor any other metadata filename has special meaning.

### File mappings

- `from`: file path or Node-compatible glob relative to `root`.
- `to`: destination file or directory, also relative to `root`.
- `{name}`: source basename without extension.
- `{parent}`: immediate source directory.
- `{relative}`: relative path from the non-glob prefix of `from`.
- `build.input`: use Vite to bundle the specified entry files. Shared chunks and assets preserve their relative generated paths.
- `copy`: copy the matched files without interpreting or changing their contents.

Directories in `to` are indicated by a trailing slash or by omitting the destination extension. Destination collisions are rejected; unmatched globs fail rather than silently omitting expected files.

## Copy-only project

```ts
githubActions({
  copy: [{ from: "metadata/**/*", to: "dist/" }],
});
```

## Standalone Node action

```ts
githubActions({
  build: { input: [{ from: "src/runner.ts", to: "dist/runner.mjs" }] },
  copy: [{ from: "manifest/action.yaml", to: "action.yaml" }],
});
```

The consumer is responsible for making its action metadata refer to `dist/runner.mjs`. The plugin does not parse or rewrite metadata.

## Breaking change in 0.2.0

The old `entries`, `runtimeFiles`, `repositoryAction`, metadata discovery and distribution generation options are removed. Replace them with `build.input` and `copy`. This intentionally does not preserve compatibility with 0.1.0.

See [monorepo examples](examples/monorepo-actions.md).
