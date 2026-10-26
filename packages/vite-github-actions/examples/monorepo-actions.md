# Vite usage: multi-action package

This example shows a project with authored action metadata in a package directory and generated distributions at the repository root. The plugin is generic: these paths belong to the **consumer**, not the plugin.

## Example layout

```text
repo/
├── packages/
│   ├── actions/
│   │   ├── actions/
│   │   │   ├── browser-extension-publish/action.yml
│   │   │   ├── check-dist/action.yml
│   │   │   ├── copy-files-to-another-repository/
│   │   │   │   ├── action.yml
│   │   │   │   └── README.md
│   │   │   ├── discover-packages/action.yml
│   │   │   ├── issue-dependency-tree/action.yml
│   │   │   ├── parse-typed-inputs/action.yml
│   │   │   ├── release-draft-sync/action.yml
│   │   │   ├── resolve-workspaces/action.yml
│   │   │   ├── setup-workspace-tools/action.yml
│   │   │   ├── validate-package-changelogs/action.yml
│   │   │   ├── validate-release-identity/action.yml
│   │   │   ├── verify-workflow-runs/action.yml
│   │   │   └── workflow-dispatch/action.yml
│   │   ├── tests/
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   └── cli/src/
│       ├── check-dist/action-entry.ts
│       ├── browser-extension-publish/entry.ts
│       └── copy-files-to-another-repository/index.ts
└── actions/                     # generated; safe to replace
```

## packages/actions/vite.config.ts

```ts
import { defineConfig } from "vite";
import { githubActions } from "@moyarich/vite-github-actions";

export default defineConfig({
  plugins: [
    githubActions({
      projectRoot: "../..",
      sourcesDir: "packages/cli/src",
      metadataDir: "packages/actions/actions",
      outputDir: "packages/actions/dist/.bundles",
      distributionDir: "actions",
      sharedChunks: true,
      assets: ["**/*.json"],
    }),
  ],
});
```

The currently implemented plugin discovers Node action entries through `entryNames` (a configurable search list), and copies composite runtime references from source directories. The example layout is illustrative: composite actions that reference scripts need matching source files. Its action metadata is not inferred from the project name or package name.

## Custom metadata filenames and independent source paths

When an application uses an alternate metadata filename or a source layout that does not mirror the metadata directories, configure both explicitly:

```ts
githubActions({
  projectRoot: "../..",
  metadataDir: "packages/action-definitions",
  metadataFile: "metadata.yaml",
  sourcesDir: "packages/implementation",
  entryNames: ["unrelated/start.ts"],
  outputDir: "packages/action-definitions/.bundles",
  distributionDir: "generated-actions",
})
```

The `metadataFile` option changes the filename searched inside each action directory; `entryNames` values resolve relative to `sourcesDir`. A generalized metadata-pattern scanner is a separate enhancement, not implied by this example. Do not place authored metadata or intermediate bundles inside `distributionDir`, because that directory is replaced on build.

**Important:** `action.yml` above is a consumer's filename, not a naming requirement for every repository. The plugin must not embed these paths as fixed conventions.
