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

## helm-oci-publish

Lints a Helm chart, packages it at the release's version, and pushes it to GHCR as an OCI chart.

```yaml
permissions:
  contents: read
  packages: write
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: panyam/ci-actions/helm-oci-publish@v0.1.3
    with:
      chart: deploy/helm/agni
      version: ${{ github.ref_name }}
      push: ${{ startsWith(github.ref, 'refs/tags/') }}
```

- It runs `helm lint` and `helm template` with the chart's default values, then `helm package` and `helm push`.
- `version` sets the chart's `version` and `appVersion` at package time, so Chart.yaml can keep a placeholder. The chart's version drops a leading `v`, since Helm wants SemVer. `appVersion` keeps it, so a template's default image tag matches an image tagged `v1.2.3`.
- With no `registry`, the chart goes to `oci://ghcr.io/<owner>/charts`, owner lowercased. It logs in with the job's token, so the job needs `packages: write`.
- `push: false` lints and packages only, as a pull request would.
- A chart with `dependencies:` gets `helm dependency build` first.

Outputs are `package` (the `.tgz`), `ref` (e.g. `ghcr.io/owner/charts/agni:1.2.3`) and `digest`. Other inputs are `login` (default `true`), `username` and `password` (default the actor and the job's token), and `plain-http` (default `false`) for a local registry.

## kind-ingress

Creates a kind cluster with ports 80 and 443 mapped to the runner, installs an ingress controller, and loads images the job just built.

```yaml
- run: docker build -t agni:dev .
- id: kind
  uses: panyam/ci-actions/kind-ingress@v0.1.3
  with:
    images: agni:dev
- run: helm install agni deploy/helm/agni --set image.tag=dev --wait
- run: curl -fsS http://localhost/
```

- The cluster comes from a pinned kind binary, checked against its sha256. kubectl's context points at it, so later `kubectl` and `helm` steps use it.
- The controller is ingress-nginx's last release, `controller-v1.15.1`, also checked against its sha256. The project was archived in March 2026. `ingress-manifest` takes another controller's manifest, with `ingress-namespace` and `ingress-selector` naming the pod to wait on.
- A pod uses a loaded image with `imagePullPolicy: Never` or `IfNotPresent`.
- The output `gateway` is the kind network's gateway address. A process on the runner bound to it is reachable from pods, as a fake external service needs.
- At the job's end it prints pods, events and each pod's logs in a collapsed group, then deletes the cluster. A post step can't tell whether the job failed, so it prints them every time.

Other inputs are `name` (default `kind`) and `node-image`, which sets the Kubernetes version (default kind's).

## compose-up

Brings up a docker compose project and waits for it to answer. At the job's end it prints the logs and tears the project down.

```yaml
- uses: panyam/ci-actions/compose-up@v0.1.3
  with:
    file: deploy/compose.yaml
    env-file: deploy/ci.env
    wait-url: https://127.0.0.1:8443/
    ca-file: ${{ runner.temp }}/ca.pem
- run: make e2e
```

- It polls `wait-url` with curl until it answers 2xx or 3xx. After `wait-timeout` seconds (default 60) it prints each service's logs and fails.
- `ca-file` is a CA curl trusts while polling, for a server on TLS from a throwaway CA.
- With no `project`, the name is unique to the run, job and step, so two compose-up steps never share containers or volumes. The output `project` is the name, for later `docker compose -p` steps.
- At the job's end it prints `ps -a` and the logs in a collapsed group, then runs `down -v --remove-orphans`. It does both even when compose-up's own step failed. A post step can't tell whether the job failed, so it prints the logs every time.

Other inputs are `file` (default `compose.yaml`, or several, one per line) and `services` (default all).

## egress-trap

Starts a proxy that logs every request it gets and answers 502. At the job's end it fails the job if anything reached it.

```yaml
- id: trap
  uses: panyam/ci-actions/egress-trap@v0.1.3
- run: hack/exercise_enterprise.sh
  env:
    HTTP_PROXY: ${{ steps.trap.outputs.url }}
    HTTPS_PROXY: ${{ steps.trap.outputs.url }}
    NO_PROXY: 127.0.0.1,localhost
```

- A server that promises to reach only the hosts it names sends everything else through the proxy. `NO_PROXY` lists the hosts it may reach.
- Each line of the log is the host, a tab, then the request line, or `CONNECT host:443` for HTTPS.
- At the job's end it stops the proxy. If the log isn't empty, it fails the job with one error per host.
- `fail: false` reports without failing, for a job that checks the log itself.
- `address` (default `127.0.0.1:0`) sets where it listens, with port 0 picking a free one. To trap traffic from containers, pass a network's gateway, such as kind-ingress's `gateway` output, with a fixed port.

Outputs are `url`, for `HTTP_PROXY` and `HTTPS_PROXY`, and `log`, the log's path.

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
