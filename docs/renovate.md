# Renovate (self-hosted)

`hasToggle.dev` is kept current by the Mend-hosted Renovate Cloud Runner. This
repo is not installed on that app, so it runs its own Renovate from
`.github/workflows/renovate.yml`, authenticated as an org-owned GitHub App.

Dependency policy itself lives in `renovate.json` at the repo root and is
unchanged from the upstream template. This document only covers the runner.

## Why a GitHub App rather than a PAT

- The token is a short-lived installation token (1 hour), minted per run, not a
  long-lived secret tied to a person's account.
- Pull requests are authored by the app, not by whoever's PAT it is, so
  `git log` and the PR list stay honest about what is automation.
- The app has its own API rate limit rather than sharing a human's.
- **Pull requests opened with an App token trigger other workflows.** Ones
  opened with the job's built-in `GITHUB_TOKEN` do not — CI would never run on
  a Renovate PR, and with `automerge: true` that means merging unverified.

## One-time setup

### 1. Create the App

Requires org-owner rights on `hasToggle`. Create it at
<https://github.com/organizations/hasToggle/settings/apps/new> with the settings
below. Getting a permission wrong fails at run time rather than at setup, so it
is worth checking the read-back rather than trusting the clicks.

| Field                          | Value                                    |
| ------------------------------ | ---------------------------------------- |
| GitHub App name                | `spinor-renovate`                        |
| Homepage URL                   | `https://github.com/hasToggle/spinor`    |
| Webhook → Active               | **unchecked** (this runner polls)        |
| Where can this GitHub App be installed | Only on this account             |
| Subscribe to events            | none                                     |

Permissions ([source](https://docs.renovatebot.com/modules/platform/github/)):

The form groups these under **Repository permissions** and **Organization
permissions**, and it labels several of them differently from the API keys used
in the manifest — which is worth knowing if you are cross-reading the two.

| Section      | Label on the form | API key               | Access       |
| ------------ | ----------------- | --------------------- | ------------ |
| Repository   | Administration    | `administration`      | Read         |
| Repository   | Checks            | `checks`              | Read & write |
| Repository   | Commit statuses   | `statuses`            | Read & write |
| Repository   | Contents          | `contents`            | Read & write |
| Repository   | Dependabot alerts | `vulnerability_alerts`| Read         |
| Repository   | Issues            | `issues`              | Read & write |
| Repository   | Metadata          | `metadata`            | Read         |
| Repository   | Pull requests     | `pull_requests`       | Read & write |
| Repository   | Workflows         | `workflows`           | Read & write |
| Organization | Members           | `members`             | Read         |

The two that are hardest to find are `statuses`, which the form calls **Commit
statuses**, and `vulnerability_alerts`, which it calls **Dependabot alerts**.
`members` is not in the Repository list at all — scroll down to the separate
Organization permissions section.

Two rows behave differently from the rest, which is expected rather than a
mis-click: **Metadata** offers no read-and-write option, and **Workflows**
offers no read-only one.

`Workflows: write` is what lets Renovate bump action versions inside
`.github/workflows/`; without it those updates fail while everything else
succeeds, which is a confusing way to find out.

Sanity check: `gh api /apps/renovate --jq .permissions` returns the permission
set of Mend's own hosted Renovate app. It matches the table above, plus
`emails: read` and `packages: read`, which the docs do not list as required.

After creating the app, verify what actually got saved rather than re-reading
the form:

```sh
gh api /apps/spinor-renovate --jq '{permissions, events}'
```

### 2. Generate a private key and note the App ID

On the app's settings page: **Generate a private key** (downloads a `.pem`) and
copy the numeric **App ID** from the top of the page.

### 3. Install the App on this repo

**Install App → hasToggle → Only select repositories → `spinor`**.

### 4. Add the secrets

```sh
gh secret set RENOVATE_APP_ID          --repo hasToggle/spinor --body '<app id>'
gh secret set RENOVATE_APP_PRIVATE_KEY --repo hasToggle/spinor < ~/Downloads/<app>.private-key.pem
```

Then delete the local `.pem` — it can always be regenerated, and a key sitting
in `~/Downloads` is a standing liability.

### 5. Verify

```sh
gh workflow run renovate.yml --repo hasToggle/spinor -f dryRun=true -f logLevel=debug
gh run watch --repo hasToggle/spinor
```

A dry run resolves every update and writes nothing. Look for
`Repository started` and a `DRY-RUN` line per branch it would have created. Then
run it again without `dryRun` to let it open real PRs.

## Repo settings this depends on

Two settings are off on this repo and both change how `automerge: true` behaves:

- **Issues are disabled.** `config:recommended` turns on the Dependency
  Dashboard, which Renovate maintains as an issue. With Issues off it logs an
  error every run and you lose the single best view of what is pending. Fix
  with `gh api -X PATCH repos/hasToggle/spinor -f has_issues=true`, or set
  `"dependencyDashboard": false` in `renovate.json` to opt out deliberately.
- **Auto-merge is disabled, `main` is unprotected, and no workflow runs on
  pull requests.** Renovate prefers GitHub's native auto-merge, which needs the
  repo setting on *and* something blocking the merge (a required check) for it
  to mean anything. With none of the three, `automerge: true` in
  `renovate.json` means patch and minor dependency updates land on `main` with
  no automated verification whatsoever — Renovate merges them itself on its
  next run. That may well be the intended trade for a repo reviewed locally,
  but it should be a decision rather than a discovery. To close it, add a CI
  workflow on `pull_request`, require it on `main`, and:

  ```sh
  gh api -X PATCH repos/hasToggle/spinor -f allow_auto_merge=true
  ```

## Notes

- `forkProcessing: "enabled"` in `renovate.json` is load-bearing: this repo is a
  fork of `hasToggle.dev`, and Renovate skips forks by default.
- Cost is not a concern — the repo is public, so Actions minutes are free.
- To pause the bot without deleting anything, disable the workflow:
  `gh workflow disable renovate.yml --repo hasToggle/spinor`.
