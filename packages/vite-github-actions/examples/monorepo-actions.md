# Example: monorepo actions package

Given this consumer layout:

```text
packages/
  actions/
    actions/
      check-dist/action.yml
      workflow-dispatch/action.yml
      copy-files-to-another-repository/README.md
    vite.config.ts
  cli/
    src/
      check-dist/action-entry.ts
      workflow-dispatch/workflow-dispatch.ts
      schemas/check-dist-config.schema.json
actions/ # generated destination
```

Define the files to build and copy without requiring the plugin to discover or parse `action.yml`:

```ts
// packages/actions/vite.config.ts
import { defineConfig } from "vite";
import { githubActions } from "@moyarich/vite-github-actions";

export default defineConfig({
  plugins: [
    githubActions({
      projectRoot: "../..",
      builds: [
        { from: "packages/cli/src/*/action-entry.ts", to: "actions/{parent}/index.mjs" },
      ],
      copies: [
        { from: "packages/actions/actions/**/*", to: "actions/" },
        { from: "packages/cli/src/schemas/**/*.json", to: "actions/schemas/" },
      ],
    }),
  ],
});
```

This illustrates one consumer's layout, **not required naming conventions**. Add additional `builds` entries for other source filenames, or use a wider matching pattern when appropriate. The plugin does not guess which scripts a composite action will execute; provide those in `builds` or `copies` as needed.

## Completely different layout

```ts
githubActions({
  projectRoot: ".",
  builds: [{ from: "implementation/**/runner.ts", to: "artifacts/{parent}/runner.mjs" }],
  copies: [{ from: "definitions/**/*", to: "artifacts/definitions/" }],
})
```

Build mappings are explicit and remain valid for arbitrary names and file hierarchies. No metadata parsing or action-name inference is performed.
