# @moyarich/vite-github-actions

Build Node.js GitHub Actions from TypeScript with Vite.

```ts
import { defineConfig } from "vite";
import { githubActions } from "@moyarich/vite-github-actions";
export default defineConfig({ plugins: [githubActions()] });
```

Defaults: source `src/actions/<name>/index.ts` (or `<name>-cli.ts`), output `actions/dist/<name>.mjs`, Node.js 24 target. Run `vite build` and commit built action distributions. Options include `sourcesDir`, `actionsDir`, `outputDir`, `target`, `bundleDependencies`, and `validateMetadata`.
