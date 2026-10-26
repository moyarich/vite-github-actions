# @moyarich/vite-github-actions

See [multi-action monorepo Vite examples](examples/monorepo-actions.md) for the `packages/actions` layout, alternate metadata filenames, and source-directory configuration.

Vite plugin to bundle Node.js GitHub Actions. Supports three layouts: existing action directories, configurable multi-action distributions, and standalone GitHub Marketplace repositories.

## Metadata-driven action discovery

```ts
import { defineConfig } from "vite";
import { githubActions } from "@moyarich/vite-github-actions";
export default defineConfig({ plugins: [githubActions()] });
```

Discover `src/actions/<name>/index.ts` or `<name>-cli.ts` and output `actions/dist/<name>.mjs`. No distribution directory is replaced in this mode.

## Standalone Marketplace action repository

The **repository root** contains `action.yml` (or `action.yaml`). Its `runs.main` points to the generated file. Consumers can then use `owner/repository@v1`.

```yaml
# action.yml at repository root
name: Example Action
description: Example Node-based GitHub Action
branding:
  icon: package
  color: blue
runs:
  using: node24
  main: dist/index.mjs
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { githubActions } from "@moyarich/vite-github-actions";
export default defineConfig({
  plugins: [
    githubActions({
      repositoryAction: { entry: "src/index.ts" },
    }),
  ],
});
```

The plugin bundles to `dist/index.mjs`, checks that the root action metadata points there, and **does not delete the repository root**. Set `repositoryAction.metadataFile` to `action.yaml` or `repositoryAction.main` to a custom distribution filename. The optional `outputDir` must match its parent directory. This mode intentionally doesn't copy metadata or manage releases.

GitHub Marketplace listing is a **separate GitHub release action**: the repository must be public and have a single root action metadata file, with a unique Marketplace name. Publish a release using GitHub's _Publish this Action to the GitHub Marketplace_ option. The plugin prepares build files but cannot register or publish the listing.

## Multi-action distribution

```ts
import { defineConfig } from "vite";
import { githubActions } from "@moyarich/vite-github-actions";
export default defineConfig({
  plugins: [
    githubActions({
      entries: { publish: "src/commands/publish.ts" },
      metadataDir: "packages/actions/actions",
      outputDir: "packages/actions/dist/bundles",
      distributionDir: "actions",
      generateDistributions: true,
      sharedChunks: true,
      runtimeFiles: {
        "check-dist": {
          "select.mjs": "packages/cli/src/check-dist/select.ts",
          "config.schema.json":
            "reusable-configurations/check-dist-config.schema.json",
        },
      },
    }),
  ],
});
```

Each directory under `metadataDir` contains an authored `action.yml`. The Vite bundles, metadata, composite scripts, and declared runtime files assemble into disposable `distributionDir`. Put metadata and intermediate bundles **outside** that directory. The generated distribution is replaced after successfully staging its contents; never place authored files there.

### Options

- `entries`: explicit action name to source entrypoint mapping; `includeDiscovered` adds automatic discovery
- `entryNames`: source filenames used during discovery, including `{name}` replacement
- `metadataDir`, `distributionDir`, `outputDir`: independent source, generated, and staging directories
- `runtimeFiles`: per-action target path → tracked source file mapping. JavaScript targets (`.js`, `.mjs`, `.cjs`) mapped from `.ts`, `.tsx`, `.mts`, or `.cts` sources are transpiled with TypeScript; other assets are copied unchanged. This strips types but does not bundle dependencies or resolve imports.
- `copyMetadata`: copy other authored files alongside `action.yml` (default true)
- `sharedChunks`: put entries under each action directory and chunks under `_assets`
- `generateDistributions`: opt in to a full generated distribution
- `target`, `bundleDependencies`, `validateMetadata`: build controls

This is a breaking change in v0.2.0. Metadata-driven discovery is required; legacy explicit entry/runtime mappings are removed.

## Breaking change: v0.2.0

`action.yml` files are the source of truth for action discovery. The former `entries`, `runtimeFiles`, `actionsDir`, `generateDistributions`, `includeDiscovered`, and `discoverFromMetadata` options are removed. Use colocated source files and `assets` patterns instead. Generated distributions are always assembled for multi-action projects.
