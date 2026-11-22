# Continuous deployment of hosted edward: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The hosted server updates itself from `main` once CI passes, with a data copy, a health check and a rollback.

**Architecture:** A bash script, `deploy/update.sh`, run every 5 minutes by a systemd timer on the server, fetches `main`, asks GitHub's public API whether CI passed, builds the new image beside the running one, copies `data/`, swaps, health-checks and rolls back. The hosted server opens every account's file at start, so a broken migration fails the health check.

**Tech Stack:** bash (within 3.2, for the macOS CI job), `git`, `jq`, `curl`, `docker compose`, systemd; Vitest for the tests, with stub commands on `PATH`.

**Spec:** `docs/superpowers/specs/2026-11-22-continuous-deploy-design.md`

## Global Constraints

- No secret anywhere: the API call is anonymous, the fetch is over the public HTTPS remote, CI is unchanged.
- The script stays within bash 3.2 and BSD userland (no `mapfile`, associative arrays, `${x,,}`, `head -n -N`, `sed -i`), since the macOS job runs the server tests.
- No test runs Docker, reaches a network or writes outside its temp folder.
- A quiet tick (nothing new, CI pending, a refused commit) writes nothing and exits 0; a failure exits 1.
- The data folder is never read or written by the script's own user: every copy, restore or removal under `data/` or `backups/<copy>/` runs in a one-off root container.

## Review Focus

1. **The first run on a server that has never run it:** no `backups/`, no `state/`, no `edward-hosted:previous`. The script creates its folders and the deploy goes through. (Task 2's first deploy test starts from a bare checkout.)
2. **CI half done:** one job finished `success` and another still `queued`. That is pending, not passed. (Task 2, `pending while any check run is not completed`.)
3. **The container taking seconds to listen:** the health check answers `000` (no connection) a few times, then 200. That is a deploy, not a rollback. (Task 2's first deploy test.)
4. **A run killed mid-deploy:** the next tick must not stay silent with the site down. (Task 3's resume tests.)

## Files

- Create `deploy/update.sh`: the deploy script.
- Create `deploy/edward-deploy.service` and `deploy/edward-deploy.timer`: the unit templates.
- Create `packages/server/test/deploy-update.test.ts`: the script's tests, in the server package so both CI jobs run them.
- Modify `packages/server/src/hosted/main.ts`: `hostedDeps` opens every account's file.
- Modify `packages/server/test/hosted-main.test.ts`: its tests.
- Modify `.gitignore`, `.dockerignore`, `README.md`.

## The script's contract (Tasks 2 and 3)

Run as `bash <path to update.sh>` with the working folder `deploy/` of the checkout; it never uses its own path. Environment: `EDWARD_PUBLIC_HOST` (required; missing, it logs `EDWARD_PUBLIC_HOST is not set` and exits 1). Constants at its top: `REPO=shoklah/edward`, `IMAGE=edward-hosted`, `HEALTH_SECONDS=60`, `KEEP=3`.

- **Compose:** `compose()` runs `docker compose -f compose.example.yml` plus `-f compose.proxy.local.yml` when that file exists.
- **As root:** `as_root <cmd…>` runs `docker run --rm -u 0 -v "$PWD/data:/data" -v "$PWD/backups:/backups" edward-hosted:previous <cmd…>`.
- **State**, in `deploy/state/` (created by the script): `refused` holds one full sha. `deploying` holds one line, `<old sha> <new sha> <copy name> <phase>`, where the phase is `building`, `stopped` or `backed-up`.
- **Copies:** `deploy/backups/<UTC time %Y%m%dT%H%M%SZ>-<old sha7>/`, so a name sort is a time sort. After a successful copy, all but the `KEEP` newest names are removed with `as_root rm -rf /backups/<name>`.
- **Health:** `healthy()` tries `curl -s -o /dev/null -w '%{http_code}' -H "Host: $EDWARD_PUBLIC_HOST" http://127.0.0.1:4317/signin` once a second (`sleep 1`), for up to `HEALTH_SECONDS` tries, true on the first `200`.
- **CI:** `curl -sf "https://api.github.com/repos/$REPO/commits/<sha>/check-runs?per_page=100"` and `jq` over the `check_runs` whose `.app.slug` is `github-actions`. None, or any whose `status` isn't `completed`, means pending. Any `conclusion` other than `success`, `skipped` or `neutral` means failed. Otherwise passed. A non-zero `curl` exit is an API error.
- **Log lines**, to stdout, exactly (`<x7>` is a short sha):
  - `new commit <new7>`
  - `not a fast-forward of <head7>, not deploying` (exit 1)
  - `fetch failed` (exit 1)
  - `GitHub API error` (exit 1)
  - `CI failed on <new7>` (exit 1)
  - `building <new7>`
  - `build failed for <new7>` (exit 1)
  - `backed up data to backups/<name>`
  - `backup failed, <old7> restarted` (exit 1)
  - `started <new7>`
  - `deployed <new7>` (exit 0)
  - `health check failed for <new7>, rolling back`
  - `rolled back <new7> to <old7>` (exit 1)
  - `rollback to <old7> failed its health check too: data copy in backups/<name>` (exit 1)
  - `resuming <new7>`
  - `abandoned <new7> after an interrupted run` (exit 0)

## Test harness (Task 2 builds it, Task 3 reuses it)

`deploy-update.test.ts` makes, per test, a temp folder with:
- `origin.git`, a bare repo, and `edward/`, its clone. The first commit holds `deploy/compose.example.yml` (any text). `git` runs with `GIT_AUTHOR_*` and `GIT_COMMITTER_*` set in its env.
- `bin/`, holding the stubs `docker`, `curl` and `sleep`. Each appends its argv as one line to `calls.log` and answers from files in the temp folder:
  - `docker`: exits 1 when `fail-build` exists and the call is `compose … build`, and when `fail-copy` exists and the call is a `run … cp`. Otherwise it exits 0.
  - `curl`: for a URL holding `check-runs`, prints `check-runs.json` (exits 22 when `fail-api` exists). For `/signin`, prints the first line of `health` and removes it, or `000` once `health` is empty.
  - `sleep`: does nothing.

`run()` spawns `/bin/bash <repo>/deploy/update.sh` (3.2 on macOS, as the service's `ExecStart` names it) with the working folder `edward/deploy`, and `PATH` set to `bin/` ahead of the inherited one, then returns `{ status, stdout, calls }`. Helpers: `push()` commits a change in a second clone and pushes it, returning its sha; `checks(...runs)` writes `check-runs.json` from `{ status, conclusion }` pairs, each with `app.slug` `github-actions` (plus one run from another app, which must be ignored).

---

### Task 1: Every account's file opened at hosted start

**Files:**
- Modify: `packages/server/src/hosted/main.ts` (`hostedDeps`)
- Test: `packages/server/test/hosted-main.test.ts`

**Interfaces:**
- Consumes: `listAccounts(db: AccountsDb)` from `hosted/accounts.ts`, `accountFiles(dataDir).db(id)`.
- Produces: `hostedDeps` throws when any stored account's file fails to open, migrate or rebuild.

- [ ] **Step 1: Write the failing tests** in `describe('hostedDeps')`, each building its own data folder first, then calling `hostedDeps` as the `beforeEach` does:
  - `opens every stored account's file before it returns`: seed `accounts.sqlite` with `openAccountsDb` and `signInAccount` for ids 101 and 202 (admin login so no invite is needed, or `addInvite` first), close it, call `hostedDeps`, and expect `accounts/101.sqlite` and `accounts/202.sqlite` to exist.
  - `throws when an account's file is not a database`: seed account 101, write `accounts/101.sqlite` as the text `not a database`, and expect `hostedDeps(...)` to throw.
- [ ] **Step 2: Run** `pnpm vitest run packages/server/test/hosted-main.test.ts`. Expected: both new tests FAIL. The first fails because no file exists; the second because nothing throws.
- [ ] **Step 3: Implement.** In `hostedDeps`, build `accounts` and `files` first, then `for (const { id } of listAccounts(accounts)) files.db(id);`, then return them in the deps. Its doc comment gains: "and opens every stored account's file, so a failing migration stops the start".
- [ ] **Step 4: Run** `pnpm vitest run --project @cwd/server` and `pnpm -r typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: open every account's file at hosted start`.

### Task 2: `update.sh`, its gates and a healthy deploy

**Files:**
- Create: `deploy/update.sh` (executable)
- Create: `packages/server/test/deploy-update.test.ts`
- Modify: `.gitignore` (`deploy/backups/`, `deploy/state/`), `.dockerignore` (`deploy/backups`, `deploy/state`)

**Interfaces:**
- Produces: the contract and the harness above. Task 3 adds to the same files.

- [ ] **Step 1: Write the failing tests**:
  - `exits silently when the checkout is on origin/main`: status 0, empty stdout, no `docker` call.
  - `stays silent while any check run is not completed`: checks `(completed, success)` and `(queued, null)`. Status 0, empty stdout, `HEAD` unchanged, no `docker` call.
  - `refuses a commit whose CI failed, once`: checks `(completed, failure)`. The first run's stdout is `new commit <7>\nCI failed on <7>`, status 1, and `state/refused` holds the sha. A second run is silent, status 0.
  - `logs a GitHub API error`: with `fail-api`, stdout ends `GitHub API error`, status 1, nothing refused.
  - `refuses to deploy when HEAD is not behind origin/main`: commit locally in `edward/` too. Stdout holds `not a fast-forward of <head7>, not deploying`, status 1.
  - `first deploy from a bare checkout`: no `backups/`, `state/` or override file, checks `(completed, success)` and `(completed, skipped)`, `health` `000`, `000`, `200`. Status 0, with three `/signin` calls. The stdout lines are `new commit`, `building`, `backed up data to backups/<name>`, `started`, `deployed`, in that order. `HEAD` is the new sha. The calls hold, in order: `docker tag edward-hosted edward-hosted:previous`, `docker compose -f compose.example.yml build`, `… stop edward`, a `docker run --rm -u 0 … edward-hosted:previous cp -a …` naming the copy, `… up -d --no-build edward`, and `docker image prune -f`. `state/deploying` doesn't exist.
  - `passes the proxy override when it exists`: with `edward/deploy/compose.proxy.local.yml` present, every `docker compose` call holds `-f compose.example.yml -f compose.proxy.local.yml`.
  - `keeps the three newest copies`: pre-create `backups/` names for four earlier times. After a deploy, the calls hold `rm -rf /backups/<oldest>` and `rm -rf /backups/<second oldest>`, and nothing else is removed.
  - `a failed build leaves the old version running`: with `fail-build`, status 1, stdout ends `build failed for <7>`. `HEAD` is the old sha, the calls hold `docker tag edward-hosted:previous edward-hosted` and no `stop`, and `state/refused` is the sha.
  - `a failed copy restarts the old version`: with `fail-copy`, status 1, stdout ends `backup failed, <old7> restarted`. `HEAD` is the old sha, the calls end with the tag restored and `up -d --no-build edward`, and `state/deploying` doesn't exist. Nothing is refused: the next tick tries again.
- [ ] **Step 2: Run** `pnpm vitest run packages/server/test/deploy-update.test.ts`. Expected: every test FAILS, since the script doesn't exist.
- [ ] **Step 3: Implement `deploy/update.sh`** by the contract, `set -u`, in this order: resume check (Task 3, a stub for now), fetch (`git fetch -q origin main`, the sha from `git rev-parse FETCH_HEAD`), the steps of the spec's "One run" 1 to 9. Write `state/deploying` with phase `building` before the `merge --ff-only <sha>`, `stopped` before `stop`, `backed-up` after the copy, and remove it after `deployed`. Rollback (Task 3) is a stub that exits 1 for now.
- [ ] **Step 4: Run** the test file, then `pnpm vitest run --project @cwd/server`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: deploy/update.sh deploys main once CI passes`.

### Task 3: Rollback and resuming an interrupted run

**Files:**
- Modify: `deploy/update.sh`, `packages/server/test/deploy-update.test.ts`

**Interfaces:**
- Consumes: Task 2's script, harness and `state/deploying` format.

- [ ] **Step 1: Write the failing tests**:
  - `rolls back data, image and checkout when the health check fails`: `health` stays empty (all `000`), then gives `200` for the old version (write it after 60 `000` lines). Status 1. Stdout holds `health check failed for <new7>, rolling back` then `rolled back <new7> to <old7>`. After the failed `up`, the calls hold `stop edward`, a root `docker run` that empties `/data` and copies `/backups/<name>/.` back, `docker tag edward-hosted:previous edward-hosted`, and `up -d --no-build edward`. `HEAD` is the old sha, `state/refused` is the new one, `state/deploying` is gone.
  - `stops loudly when the old version fails too`: `health` all `000`. Status 1. Stdout ends `rollback to <old7> failed its health check too: data copy in backups/<name>`. `state/deploying` is gone, and nothing removes the copy.
  - `resumes a run that died after the copy`: set `state/deploying` to `<old> <new> <name> backed-up`, with `HEAD` at new. Stdout `resuming <new7>`, then `started`, `deployed`, status 0, and no `build` or `cp` call.
  - `resumes into a rollback when the resumed version is unhealthy`: as above, with `health` `000`s and then `200`. The rollback happens as in the first test, using `<name>`.
  - `abandons a run that died before the copy finished`: phase `stopped`, `HEAD` at new. Stdout `abandoned <new7> after an interrupted run`, status 0. The calls hold `rm -rf /backups/<name>`, the tag restored and `up -d --no-build edward`. `HEAD` is old, nothing is refused, and the state is gone. The same holds for phase `building`.
- [ ] **Step 2: Run** the test file. Expected: the five new tests FAIL.
- [ ] **Step 3: Implement** `rollback <old> <new> <name>` and the resume check that runs first, by the spec's "Rollback" and "A run that died midway", the phases as above. An interrupted run in phase `building` or `stopped` never touched `data/`, so it is abandoned: the checkout and tag go back and the old version restarts. In phase `backed-up` it resumes at `up`.
- [ ] **Step 4: Run** the test file, then `pnpm vitest run --project @cwd/server`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: update.sh rolls back and resumes an interrupted run`.

### Task 4: Units and the README

**Failing-test check:** exempt: unit templates and docs, no new behaviour.

**Files:**
- Create: `deploy/edward-deploy.service`, `deploy/edward-deploy.timer`
- Modify: `README.md` (Hosted)

- [ ] **Step 1: Write the units.** The service, with placeholders the README tells the owner to fill in:

```ini
# Runs deploy/update.sh once. Installed by the README's "Updates" step; fill in <user>, <checkout> and <host>.
[Unit]
Description=Update hosted edward from main
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=<user>
WorkingDirectory=<checkout>/deploy
Environment=EDWARD_PUBLIC_HOST=<host>
RuntimeDirectory=edward-deploy
# A copy runs, so the pull can't rewrite the script under it.
ExecStart=/bin/bash -c 'cp update.sh "$${RUNTIME_DIRECTORY}/update.sh" && exec /bin/bash "$${RUNTIME_DIRECTORY}/update.sh"'
TimeoutStartSec=30min
```

  The timer:

```ini
# Runs edward-deploy.service 2 minutes after boot, then 5 minutes after each run ends.
[Unit]
Description=Update hosted edward from main every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

- [ ] **Step 2: README.** Add `### Updates` under Hosted, before "Moving a local history". It covers:
  - What a run does, in five lines: it checks CI, builds, copies `data/` to `backups/`, swaps, health-checks and rolls back. It also says a run is silent when nothing is new.
  - What it needs: `jq` and `curl`, and the deploying user in the `docker` group.
  - Installing, once, from `deploy/`: `sed` the three placeholders into copies in `/etc/systemd/system/`, then `sudo systemctl daemon-reload && sudo systemctl enable --now edward-deploy.timer`.
  - Reading results: `journalctl -u edward-deploy`, and `systemctl status edward-deploy` for the last run.
  - That `backups/` keeps the three newest copies, guards a deploy only, and is no replacement for the server's backups.
  - That a refused commit waits for the next one on `main`, and `rm deploy/state/refused` retries it.
  - Deploying by hand still works: `sudo systemctl stop edward-deploy.timer` first, then step 4's command, then start the timer again.

  Step 4's text stays, as the first start.
- [ ] **Step 3: Check.** Run `systemd-analyze verify` if it's available (on the server, at Task 5), then `pnpm -r typecheck` and `pnpm vitest run --project @cwd/server`. Expected: PASS.
- [ ] **Step 4: Commit** `docs: install and read the hosted updater`.

### Task 5: The first real deploy (in the session, with the owner)

**Failing-test check:** exempt: an operation on the server, no code.

- [ ] Once the PR merges and CI passes on `main`, on the server: `git pull --ff-only` in `<checkout>` one last time by hand, then `docker compose … up -d --build`, so the server runs Task 1. Install the units per the README with the owner's sudo; the owner types the sudo commands.
- [ ] Verify the next tick is silent (`journalctl -u edward-deploy` shows a run, no lines), then merge a trivial commit to `main` (a README line) and watch `journalctl -fu edward-deploy` show `new commit`, `building`, `backed up`, `started`, `deployed`. Then check `https://<host>/signin` answers 200 and `docker inspect` shows the new image.
