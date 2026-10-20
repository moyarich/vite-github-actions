# Vite GitHub Actions

TypeScript-first Vite plugin to build Node.js GitHub Actions using Vite/Rollup, with automatic entry point discovery.

The publishable package lives at `packages/vite-github-actions` as `@moyarich/vite-github-actions`.

```ts
import { defineConfig } from "vite";
import { githubActions } from "@moyarich/vite-github-actions";

export default defineConfig({
  plugins: [githubActions({
    sourcesDir: "src/actions",
    actionsDir: "actions",
    outputDir: "actions/dist",
    target: "node24",
    validateMetadata: true,
  })],
});
```

Each directory in `src/actions/*` must contain `index.ts` or `<directory>-cli.ts`. Vite generates a standalone `actions/dist/<directory>.mjs`. Existing action.yml files are checked for corresponding distribution references. Keep generated action bundles committed for GitHub Actions consumers.

## Development

```sh
npm ci
npm run checks
npm run pack:check
```

This repository originated from the reusable-workflows-callers monorepo template. The template's example and playground remain present during migration; the new plugin is in `packages/vite-github-actions`.
