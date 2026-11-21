# ci-actions

GitHub Actions shared across panyam's repos. Reference each one by a tag.

## setup-browser

Sets up a browser for tests that drive `playwright-core`, without downloading one when the runner already has it.

```yaml
- run: pnpm install --frozen-lockfile
  working-directory: web
- uses: panyam/ci-actions/setup-browser@v0.1.0
  with:
    working-directory: web
```

Then launch with the path the action exports:

```js
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
```

- When the runner has Google Chrome, as GitHub's Ubuntu images do, the action sets `CHROME_PATH` to it. The job downloads nothing and runs no apt.
- Otherwise it installs Playwright's own Chromium for the `playwright-core` in `working-directory`, cached on that version. It skips `--with-deps`, since the runner already has Chromium's libraries, and the fonts that flag adds came from a mirror that stalled for minutes at a time (panyam/goapplib#191).
- Run locally, `CHROME_PATH` is unset, so the same launch line uses Playwright's Chromium.
- The runner's Chrome moves when GitHub updates the image, not when you bump `playwright-core`. Set `force-download: true` to pin the browser to `playwright-core` instead.

Inputs are `working-directory` (default `.`) and `force-download` (default `false`). The output `chrome-path` is the browser `CHROME_PATH` was set to, or empty.

The `test` workflow runs both paths on every push.

## setup-go-pnpm

Sets up Go, pnpm and Node, then runs `pnpm install --frozen-lockfile`, for a job with a Go module and a pnpm frontend.

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
- uses: panyam/ci-actions/setup-go-pnpm@v0.1.1
  with:
    working-directory: web
```

- With no `pnpm-version`, pnpm comes from the `packageManager` field in `working-directory`'s package.json, so a developer's pnpm and CI's match. Setting both fails, since pnpm/action-setup refuses two versions.
- Node's pnpm cache is keyed on `working-directory`'s `pnpm-lock.yaml`.
- `go-cache: false` turns off setup-go's cache, for a job that keeps its own.

Other inputs are `go-version-file` (default `go.mod`), `go-cache-dependency-path` (default: setup-go's), `node-version` (default `22`) and `install` (default `true`).
