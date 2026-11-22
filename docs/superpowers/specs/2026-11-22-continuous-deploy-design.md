# Continuous deployment of hosted edward

Hosted edward (https://<host>) updates itself when a commit lands on `main` and CI passes on it. Today the owner, or a session with SSH access, does it by hand on the server, from `<checkout>/deploy`: `git pull --ff-only`, then `docker compose -f compose.example.yml -f compose.proxy.local.yml up -d --build`.

## Intent

Every merge to `main` should reach the hosted server without anyone logging in, and a bad build must never leave the site down or the accounts' data damaged. The repo is public and CI holds no secret (CLAUDE.md), and that stays true.

## The server, as it is

- A machine at a private address: no GitHub-hosted runner can reach it, and it runs no tunnel.
- Docker with compose. `curl`, `flock` and `git` are installed.
- The checkout is `<checkout>` on `main`, its `origin` the public HTTPS URL (`https://github.com/shoklah/edward.git`), so a fetch needs no key or agent, owned by the deploying user `<user>` (in the `docker` group).
- `deploy/data` is owned by uid 1000 (the container's `node` user) with a private `claude-workflow-dashboard/` folder, so `<user>` can't read the data files directly: anything that copies them runs in a container.
- `deploy/compose.proxy.local.yml` (git-ignored) joins edward to the proxy's Docker network; the container also publishes `127.0.0.1:4317`.
- From outside, `/signin` answers 200 and `/api/status` 401.

## Goals

- A commit on `main` whose CI passed is live within about 5 minutes plus the build.
- A commit whose CI failed, or that fails its health check after starting, is never left running: the previous version comes back, with the data as it was before the deploy.
- No secret in GitHub, no inbound access to the server, no change to CI.

## Non-goals

- Notifications: a failure is written to journald only (`journalctl -u edward-deploy`); the owner looks there.
- Replacing the server's own backups: the deploy's data copies guard a deploy, not the machine.
- Deploying anything but `main`, or more than one server.
- Zero-downtime swaps: a few seconds while the container restarts are fine.

## Anti-goals

- A deploy that runs a migration and then rolls back the code but not the data: the old code would face a newer schema.
- Any path by which a pull request, a fork's included, can run code on the server.
- A deploy that leaves the checkout, the image and the running container disagreeing about which commit is live without saying so.

## Approaches

A fourth question, how a broken account file is caught, had three answers: open every account's file at start (picked), a separate check opening every account (a new route or script with its own tests and privacy rules, for what the start gives free), or accepting the gap.


- **A, the server pulls (picked).** A systemd timer on the server checks `origin/main` every 5 minutes, asks GitHub's public API whether CI passed on it, and deploys. Nothing is stored in GitHub, nothing reaches into the server, and a fork's PR can't touch it. Feedback lives in journald, not in Actions.
- **B, Actions SSHes in.** A deploy job after CI logs in to the server. The runner can't reach a private address, so it needs either a self-hosted runner, which on a public personal repo lets any fork PR's workflow run code on the machine behind one approval click, or a tunnel (none is installed), an OAuth client and a deploy key in a protected environment. Declined: more secrets and a new remote-access path for this one job.
- **C, a registry and a watcher.** CI publishes the image to GHCR with its built-in token and the server pulls tagged images. The server would never build, but it adds a registry and a publish job for little gain over A on a machine that builds well enough. Declined.

## The design

### Pieces, all in `deploy/`

- `update.sh`, the deploy script, committed.
- `edward-deploy.service` and `edward-deploy.timer`, committed systemd unit templates: a oneshot service run as `<user>` with the checkout's `deploy/` as its working folder, and a timer every 5 minutes (`OnUnitActiveSec=5min`, plus `OnBootSec`). Installed once by the owner as system units with sudo (copied to `/etc/systemd/system/`, `systemctl enable --now edward-deploy.timer`), so they run without a login and log under `edward-deploy`. systemd never starts a oneshot that is still running, so a long build never overlaps the next tick; `TimeoutStartSec=30min` ends a hung run, which then counts as a run that died midway (below). The committed service holds a placeholder for the public host (`EDWARD_PUBLIC_HOST`), which the owner fills in at install.
- `backups/` and the script's state file (the last refused commit, and a deploy in progress: its old and new commits and its backup's folder) beside `data/`, both git-ignored; `backups/` is also in `.dockerignore`, since the build's `COPY . .` can't read the root-owned copies.

### One run of `update.sh`

1. `git fetch origin main`. If `HEAD` is `origin/main`, exit silently: a quiet tick writes nothing.
2. If `origin/main` isn't a fast-forward of `HEAD` (someone committed on the server), log it and exit without deploying.
3. If `origin/main` is the recorded refused commit, exit silently: it waits for the next commit.
4. Ask the public API (`GET /repos/shoklah/edward/commits/<sha>/check-runs`, no token: one call per new commit per tick, far under the anonymous 60 an hour) for the commit's GitHub Actions check runs. Not all completed, or none yet: exit silently and wait for the next tick. Any concluded otherwise than `success`, `skipped` or `neutral`: record the commit as refused, log it, exit. All successes: go on. An API error is logged and the tick ends.
5. Build the new image while the old container keeps serving: `docker tag edward-hosted edward-hosted:previous`, then check out the new commit (`git merge --ff-only`) and `docker compose … build`. A failed build: reset the checkout to the old commit, restore the tag, record the commit as refused, log, exit. The site never stopped.
6. Stop the container (`docker compose … stop edward`), so no SQLite file is copied mid-write, and copy `data/` to `backups/<time>-<old sha7>/` (time first, so a name sort is a time sort) in a one-off container as root (`-u 0`, the `previous` image, `cp -a`), keeping the three newest copies. A failed copy: start the old container again, reset, log, exit without deploying.
7. Start the new one: `docker compose … up -d --no-build edward`.
8. Health check: for up to 60 seconds, `curl` `http://127.0.0.1:4317/signin` with `Host: <host>` (the public host read from `data/…/.env` is not readable by `<user>`, so the script takes it from its environment, `EDWARD_PUBLIC_HOST`, set in the service unit) until it answers 200.
9. Healthy: log `deployed <sha7>` and remove dangling images (`docker image prune -f`). Unhealthy: roll back.

### Every account's file at start

Today an account's file is migrated and rebuilt (`accountFiles`' `db`) on its first request, which `/signin` never makes, so a commit whose migration breaks an account's file would pass the health check. The one app change: `runHosted` opens every account's file once before it serves (`files.db(id)` for each of `listAccounts`), so a failing migration or rebuild throws, the server never listens, the health check fails and the rollback restores the data. A start takes a little longer, by one migration check and rebuild per account. Tested like the other hosted start code, through `hostedDeps` over a temp data folder.

### Rollback

Stop the new container, put `data/` back from the copy just taken (in a one-off root container: empty `data/`, copy back with `cp -a`), tag `edward-hosted:previous` as `edward-hosted`, reset the checkout to the old commit, start it with `--no-build`, health-check it again, record the new commit as refused and log `rolled back <new sha7> to <old sha7>`. If the old one fails its check too, log that loudly and stop: the owner steps in, with the copy still in `backups/`.

### A run that died midway

A reboot, a kill or the start timeout can end a run after the checkout moved and before step 9 or the rollback finished, leaving the container stopped or unchecked while `HEAD` is already `origin/main`. Step 5 records the deploy in progress in the state file before it moves the checkout, with its phase (building, stopped, backed up, rolling back), and a successful step 9 or a finished rollback clears it. A run that died before its copy finished never touched `data/`: the next run abandons it (checkout, tag and old container back, nothing refused) and the tick after retries. A run that finds one recorded past its copy starts there, before step 1: it logs `resuming <new sha7>`, starts the container (`up -d --no-build`) and runs the health check; healthy, it logs `deployed`; unhealthy, it rolls back from the recorded backup. A run that died during a rollback redoes the whole rollback, whose steps are all safe to repeat. A failed restore starts nothing and stops loudly; any failure that ends a deploy refuses its commit, so a lasting cause doesn't repeat every tick.

### The compose files

The script passes `-f compose.example.yml`, and `-f compose.proxy.local.yml` when that file exists, to every `docker compose` command, so the same script serves a server with or without a proxy container.

### The script updating itself

The pull in step 5 can rewrite `update.sh` while it runs. The service runs a copy: `ExecStart` copies `update.sh` to a temporary file and runs that, so a run always finishes with the script it started with, and the next tick runs the new one.

### Logging

One line per step that changes something, to stdout, which systemd sends to journald: `new commit`, `CI pending` is silent, `CI failed`, `building`, `backed up`, `started`, `deployed`, `rolled back`, each with the short commit. Failures exit non-zero, so `systemctl status edward-deploy` and `systemctl --failed` show them too.

### Tests

The script is tested without Docker, GitHub or a network: Vitest tests run it against a temporary git repo standing in for the checkout and its origin, with `docker`, `curl` and the API call replaced by stub commands on `PATH` that record their calls and answer as each case needs (CI pending, failed, passed; build failing; health check failing; rollback). They cover each numbered step's outcome, the rollback and a resumed run, and run in CI like the other server tests; the script stays within macOS's bash 3.2, since the macOS job runs the server tests too.

### README

The Hosted section gains "Updates": what the timer does, installing the units once, reading `journalctl -u edward-deploy`, where the deploy's data copies are and that they're no replacement for backups, and how to deploy by hand still (stop the timer first).

## Left to the builder

- Where the tests live (beside the server package's tests is the likely place) and how the stubs are written.
- The exact log wording and the state file's name.
- `OnBootSec`'s value.
