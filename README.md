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

## vulncheck

Runs govulncheck, or your own scan command. When the scan fails, the action files an issue, and while that issue is open each later failure adds a comment to it.

```yaml
on:
  schedule:
    - cron: '30 6 * * 1'
  push:
    tags: ['v*']
  workflow_dispatch:
permissions:
  contents: read
  issues: write
jobs:
  vulncheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: panyam/ci-actions/vulncheck@v0.1.1
```

- With no `command`, it runs a pinned `govulncheck ./...` in `working-directory`. A repo with several modules usually has a Makefile target that scans each one, so it passes `command: make vulncheck`.
- The issue's title starts with `title-prefix` (default `vulncheck:`), and it gets `labels` (default `P1,bug`). An open issue with that prefix gets a comment instead of a second issue.
- `report: false` fails the job without filing anything.
- The job needs `issues: write`.

Other inputs are `go-version-file` (default `go.mod`) and `cache-dependency-path` (default `**/go.sum`).

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

## go-build-cache

Restores Go's build cache from the newest earlier run of the same job, and saves it from the default branch only. Packages that did not change then compile from cache on every branch.

```yaml
- uses: actions/setup-go@d8cbb8045d7f43706b9177cceb36c1f91a6644d5 # v7.1.0
  with:
    go-version-file: go.mod
- uses: panyam/ci-actions/go-build-cache@v0.1.2
  with:
    key: browser
- run: make browser-test
```

- setup-go's own cache is keyed on `go.sum`, so it misses after every dependency bump. Only one job saves it, and that job may not build what yours builds. A `GOOS=js` build, for one, never comes from it.
- Each save from the default branch is a new entry named for the run, and a restore takes the newest entry with the job's `key`, Go version, OS and architecture. Go's build cache is addressed by content, so an entry from an older commit still serves every package that has not changed.
- A pull request reads the default branch's entries and saves none, so pull requests don't push the default branch's entries out of the repo's 10 GB cache.
- Go on PATH is required, so run setup-go first.

Inputs are `key` (default `default`), naming the job's builds so jobs that build different packages keep separate entries, and `save` (`auto`, `true` or `false`, default `auto`). The output `matched-key` names the entry restored when the run does not save.

## npm-publish (reusable workflow)

Publishes one npm package through npm trusted publishing, so the caller needs no `NPM_TOKEN`. It moved here from servicekit, with the same inputs, so a caller changes only its `uses:` line.

```yaml
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  id-token: write
jobs:
  publish:
    uses: panyam/ci-actions/.github/workflows/npm-publish.yml@v0.1.1
    with:
      working-directory: ts
```

- It checks that the tag, less `tag-prefix` (default `v`), matches package.json's version. Then it installs, runs `npm run build` if there is one, and runs `test-command` if given.
- It refuses a tarball with `.test.` files in it, and skips a version npm already has.
- On npm, the package's trusted publisher names the caller's repo and workflow file, not this one: `npm trust github <package> --repo <owner>/<repo> --file publish-npm.yml --allow-publish`.
- `package-manager: pnpm` installs with `pnpm install --frozen-lockfile --ignore-scripts`. Publishing always uses npm.

Other inputs are `node-version` (default `24`), `pnpm-version` (default `12`), and two for testing, `tag` and `dry-run`.
