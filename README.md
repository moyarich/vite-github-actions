# Reusable Workflows Callers — Monorepo Template

Starter template for npm-workspaces projects modeled on recent `moyarich` repositories.

## Structure

| Path                 | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `packages/example/`  | Buildable TypeScript library with Vitest tests                      |
| `apps/playground/`   | Vite + React playground consuming example library                   |
| `.github/workflows/` | CI, release, publishing, maintenance, and reusable workflow callers |
| `eslint.config.mjs`  | Shared ESLint flat config and Prettier compatibility                |
| `tsconfig.json`      | Shared TypeScript defaults                                          |

## Getting started

```sh
npm install
npm run dev
npm run checks
npm run pack:check
```

Root build and test scripts delegate to npm workspaces using `--workspaces --if-present`. Development targets the conventional `apps/playground` path, without hardcoding a package name. Vite handles individual workspace builds and the playground development server; no custom workspace runner is needed. Rename the `@template/*` workspaces and replace the example package with your own code.

## Workflows and release safety

The GitHub Actions callers were copied from `moyarich/workspace-tools`. Review all hardcoded package selectors, release triggers, publishing secrets, branch names, and build paths before enabling them in a new repository. In particular, automatic release/publish workflows should remain dry-run or disabled until intentionally configured.

The Workspace Tools CLI source in migrated callers is `checkout:upstream;branch:main`, not `checkout:current`, because this repository does not contain the Workspace Tools package. For reproducible releases, pin a published CLI version or immutable commit.

`check-dist.yml` is an opt-in example for projects that commit build outputs. If package `dist/` is gitignored, this check will fail until you explicitly choose to track distributions or replace it with an artifact-only check.

`npm run pack:check` uses npm's built-in `--workspaces` flag and includes all configured workspaces, so adjust the workspace selection if you only want to pack publishable packages.

## Typical scripts

`npm run dev`, `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run checks`.

## Adapting this template

Add packages under `packages/*`, applications under `apps/*`, and their own `build`, `typecheck`, and `test` scripts. Keep reusable logic in packages and application-specific examples in playgrounds. Configure registry publishing only for real release packages.
