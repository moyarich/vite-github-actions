# Browser extension publishing

Copy `.github/workflows/publish-browser-extension.yml` into a browser extension repository. It delegates packaging and store submissions to `moyarich/reusable-workflows/.github/workflows/reusable_browser-extension-publish.yml@main`.

Run **Publish browser extension** manually. Defaults are `dry-run: true`, `registry: all`, `package: .` and `build-directory: dist`. The build folder is repository-relative and must contain the final `manifest.json`. For a monorepo, set `package` and `build-directory` independently, e.g. `packages/browser-extension` and `packages/browser-extension/dist`. Adjust `install-command` and `build-command` in the caller to match the repository; the reusable workflow does not assume a particular bundler.

## Store setup

| Store            | Secret in caller repository                                           | Other input                                                  |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Chrome Web Store | `_CHROME_CLIENT_ID`, `_CHROME_CLIENT_SECRET`, `_CHROME_REFRESH_TOKEN` | `chrome-publisher-id`, `chrome-extension-id`                 |
| Firefox Add-ons  | `_FIREFOX_API_KEY`, `_FIREFOX_API_SECRET`                             | Optional `firefox-addon-id` to compare to the built manifest |

Configure an environment named `release` with required reviewers for live publishing. Chrome uses Chrome Web Store API **V2**; the item must already exist and have its listing configured. Firefox uses Mozilla's `web-ext sign --channel listed` API and requires `browser_specific_settings.gecko.id` in the built manifest for updates. Both stores may review submissions before making them publicly available.

A dry run builds the extension, checks the manifest, archives and uploads `extension.zip`, and does not require store credentials or alter a store. Live runs use the selected registry, require release environment approval, and upload the ZIP to Chrome or submit to AMO. A Firefox-signed artifact is uploaded when available.

This publisher intentionally does **not** modify GitHub Releases. Immutable published releases cannot be assumed to accept new assets; use an existing release preparation/publishing workflow separately. Store submissions are not guaranteed to be live immediately following a successful job.

## Commander.js TypeScript CLI

The reusable workflow checks out `reusable-workflows`, builds the TypeScript action entry point in `src/actions/browser-extension-publish/browser-extension-publish-cli.ts` with the existing Vite CLI bundler, and runs it with Node 24. It does not require a published npm package.

The commands are `validate`, `package`, `publish-chrome`, and `publish-firefox`. To run locally in a checkout of `reusable-workflows`, run `npm ci && npm run build:cli`, then for example:

```sh
node actions/dist/browser-extension-publish.mjs validate --build-directory packages/extension/dist --registry all
node actions/dist/browser-extension-publish.mjs package --build-directory packages/extension/dist --output extension.zip
```

Publishing commands require their corresponding store credentials as environment variables. The `manifest.ts` module is reusable from Vitest without invoking the CLI.
