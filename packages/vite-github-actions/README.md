# @moyarich/vite-github-actions

Vite plugin to build Node.js GitHub Actions and assemble their distributions. Version 0.2.0 removes the prior explicit `entries` and `runtimeFiles` mapping API.

## Multi-action project

```ts
import { defineConfig } from "vite";
import { githubActions } from "@moyarich/vite-github-actions";

export default defineConfig({
  plugins: [githubActions({
    projectRoot: "../..",
    metadataDir: "packages/actions/actions",
    metadataPatterns: ["**/*.yml", "**/*.yaml"],
    sourcesDir: "packages/cli/src",
    outputDir: "packages/actions/dist/.bundles",
    distributionDir: "actions",
    sharedChunks: true,
    assets: ["**/*.json"],
  })],
});
```

The metadata patterns are evaluated relative to `metadataDir`, and a file is accepted as action metadata when it declares a supported `runs.using` value. Node entry source candidates are looked up under `sourcesDir`; `entryNames` supports `{name}` substitution. Composite references to `$GITHUB_ACTION_PATH` are resolved against each action's source directory. Generated distribution content replaces `distributionDir`: do not put authored files there.

For a source layout that differs from the metadata directory, use `sourceDirs` keyed by discovered action identity:

```ts
githubActions({
  projectRoot: ".",
  metadataDir: "definitions",
  metadataPatterns: ["**/metadata.yaml"],
  sourcesDir: "implementations",
  sourceDirs: { custom: "implementations/unrelated" },
  entryNames: ["start.ts"],
  outputDir: "build/bundles",
  distributionDir: "build/actions",
})
```

The plugin does **not** require metadata named `action.yml`. `metadataPatterns` controls discovery, and paths are supplied by each consuming repository. Relative metadata directories become action identities (separated with hyphens); duplicate identities are rejected.

## Standalone repository action

```ts
githubActions({
  repositoryAction: {
    entry: "source/start.ts",
    metadataFile: "metadata.yaml",
    main: "dist/start.mjs",
  },
})
```

A standalone Node action must declare the same compiled entry in its metadata. The plugin doesn't publish Marketplace listings.

## Behavior and limitations

- `metadataDir`, `sourcesDir`, `outputDir`, `distributionDir`, and `projectRoot` are configurable.
- `metadataPatterns` and `assets` accept supported patterns such as `**/*.json`, `**/*.yaml` and exact paths; they are not a complete glob implementation.
- `entryNames` is an ordered list of source-relative candidate paths; `sourceDirs` allows per-action overrides.
- JSON and other assets are copied without modification, retaining paths relative to the source action.
- Composite TypeScript runtime files are transpiled individually; they are not dependency-bundled. Imported dependencies must be bundled separately.
- Generated output is staged and then replaced. Source metadata and intermediate bundles cannot be located inside `distributionDir`.

See [the monorepo layout example](examples/monorepo-actions.md) for a concrete consumer project.
