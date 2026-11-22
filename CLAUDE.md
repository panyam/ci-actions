# ci-actions

GitHub Actions shared across panyam's repos. Each top-level folder is one action. `npm-publish` is
a reusable workflow under `.github/workflows/`. README.md documents every action's inputs.

## Adding an action

- One folder per action, with an `action.yml`. Every input and output gets a `description` that
  says what empty or `false` means.
- Pin third-party actions by commit SHA with the version in a comment, copied from an existing
  `action.yml`. Pin downloaded binaries and manifests by version and check their sha256
  (see `kind-ingress/main.js`).
- Composite by default. Use a JS action (`using: node24`, `main` + `post`, `post-if: always()`)
  when the action must clean up or check something after the caller's later steps. Composite
  actions can't have a post step (PR 18).
- JS actions require `lib/gha.js` for inputs, outputs, state and `run`. Don't add `@actions/core`
  or any `node_modules`. The runner downloads the whole repo at the action's ref, so `../lib`
  resolves.
- A post step can't see whether the job failed. Print diagnostics every time, in a collapsed
  `::group::`.
- Inputs with hyphens arrive as `INPUT_WAIT-URL`. A shell can't set those, so test locally with
  `env 'INPUT_WAIT-URL=...' node <action>/main.js`.

## Tests

- `.github/workflows/test.yml` has at least one job per action, using `uses: ./<action>`.
  Fixtures live under `test/<action>/`.
- A failure path gets a job with `continue-on-error: true` on the step, then a step that asserts
  `steps.<id>.outcome == failure` (see `vulncheck-fails`, `compose-up-timeout`).
- When a post step's verdict would fail the job, cover it with a `node --test` file that runs
  `main.js` and `post.js` as the runner would (`test/egress/trap.test.mjs`). Keep the workflow
  job green with the action's report-only input.
- A post step can be checked mid-job by running `node <action>/post.js` with `STATE_<name>` set.
  The real post step runs again at job end, so it must be idempotent.

## Releases

- Tags are `vX.Y.Z`, and each gets a short GitHub Release note. There is no CHANGELOG.
- New actions go out as a patch release while the repo is on 0.1.x.
- Before tagging, update the README's `uses: ...@vX.Y.Z` lines for the actions the release adds
  or changes. Lines for unchanged actions keep their older tags.
- Consumers pin a tag, so a fix needs a new tag. Never move an existing one.
