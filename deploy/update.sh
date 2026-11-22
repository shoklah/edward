#!/bin/bash
# Deploys origin/main once its CI passes; run every 5 minutes by edward-deploy.timer, from the checkout's deploy/.
# A quiet tick (nothing new, CI pending, a refused commit) writes nothing and exits 0; a failure logs and exits 1.
# Stays within bash 3.2 and BSD userland. data/ and its copies are touched only in a one-off root container.
set -u

REPO=shoklah/edward
IMAGE=edward-hosted
HEALTH_SECONDS=60
KEEP=3

compose() {
  if [ -e compose.proxy.local.yml ]; then
    docker compose -f compose.example.yml -f compose.proxy.local.yml "$@"
  else
    docker compose -f compose.example.yml "$@"
  fi
}

as_root() {
  docker run --rm -u 0 -v "$PWD/data:/data" -v "$PWD/backups:/backups" "$IMAGE:previous" "$@"
}

healthy() {
  local i=0 code
  while [ "$i" -lt "$HEALTH_SECONDS" ]; do
    code=$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' -H "Host: $EDWARD_PUBLIC_HOST" http://127.0.0.1:4317/signin)
    [ "$code" = 200 ] && return 0
    i=$((i + 1))
    sleep 1
  done
  return 1
}

# Prints pending, failed or passed for a commit's GitHub Actions check runs; fails on an API error.
ci() {
  local body
  body=$(curl -sf --max-time 20 "https://api.github.com/repos/$REPO/commits/$1/check-runs?per_page=100") || return 1
  printf '%s' "$body" | jq -er '
    [.check_runs[] | select(.app.slug == "github-actions")]
    | if length == 0 or any(.status != "completed") then "pending"
      elif any(.conclusion as $c | ["success", "skipped", "neutral"] | index($c) | not) then "failed"
      else "passed" end'
}

refuse() {
  mkdir -p state
  echo "$1" > state/refused
}

# Writes the deploy in progress through a temp file, so state/deploying is never empty or partial.
deploying() {
  if echo "$old $new $name $1" > state/deploying.tmp && mv state/deploying.tmp state/deploying; then
    return 0
  fi
  rm -f state/deploying.tmp
  return 1
}

# Removes all but the KEEP newest copies, counting the one just taken.
prune_copies() {
  set -- $(ls -1 backups | grep -vxF "$name" | sort)
  while [ "$#" -ge "$KEEP" ]; do
    as_root rm -rf "/backups/$1"
    shift
  done
}

# Puts the old commit's checkout, image and container back; fails when any step does.
restart_old() {
  git reset -q --hard "$old" && docker tag "$IMAGE:previous" "$IMAGE" && compose up -d --no-build edward
}

# The stop or the copy failed: the new commit is refused and the old version started again. If it can't be,
# state/deploying keeps its building or stopped phase (a failed write leaves the earlier one), whose resume retries.
backup_failed() {
  as_root rm -rf "/backups/$name"
  refuse "$new"
  if ! restart_old; then
    echo "backup failed, restart of ${old:0:7} failed, will retry"
    exit 1
  fi
  rm -f state/deploying
  echo "backup failed, ${old:0:7} restarted"
  exit 1
}

# Puts back the data and the old version after a failed health check; every step is safe to repeat.
rollback() {
  # A failed write keeps the earlier phase, whose resume rolls back again; the unhealthy version must still go.
  deploying rolling-back
  if ! compose stop edward || ! as_root find /data -mindepth 1 -delete || ! as_root cp -a "/backups/$name/." /data/; then
    refuse "$new"
    # Every later run stops at state/halted, so no deploy backs up or prunes over the missing data. If it can't
    # be written, state/deploying stays and the next run redoes the rollback instead.
    local msg="restore failed: data copy in backups/$name"
    echo "$msg" > state/halted && rm -f state/deploying
    echo "$msg"
    exit 1
  fi
  restart_old
  refuse "$new"
  rm -f state/deploying
  if ! healthy; then
    echo "rollback to ${old:0:7} failed its health check too: data copy in backups/$name"
    exit 1
  fi
  echo "rolled back ${new:0:7} to ${old:0:7}"
  exit 1
}

# Starts the new version from its copy taken, then deploys it or rolls back.
start_new() {
  compose up -d --no-build edward
  echo "started ${new:0:7}"
  if ! healthy; then
    echo "health check failed for ${new:0:7}, rolling back"
    rollback
  fi
  echo "deployed ${new:0:7}"
  rm -f state/deploying
  docker image prune -f
  exit 0
}

# Picks up a deploy that a killed run left in state/deploying.
resume() {
  [ -e state/deploying ] || return 0
  # A missing field leaves phase empty, which reads as unreadable.
  read -r old new name phase < state/deploying
  case "$phase" in
    backed-up)
      echo "resuming ${new:0:7}"
      start_new ;;
    rolling-back)
      echo "resuming the rollback of ${new:0:7}"
      rollback ;;
    building|stopped)
      # data/ was never touched, so the old version comes back and the tick after retries.
      as_root rm -rf "/backups/$name"
      if ! restart_old; then
        echo "restart of ${old:0:7} failed, will retry"
        exit 1
      fi
      rm -f state/deploying
      echo "abandoned ${new:0:7} after an interrupted run"
      exit 0 ;;
    *)
      echo "unreadable deploy state, not deploying"
      exit 1 ;;
  esac
}

if [ -z "${EDWARD_PUBLIC_HOST:-}" ]; then
  echo "EDWARD_PUBLIC_HOST is not set"
  exit 1
fi

if [ -e state/halted ]; then
  echo "halted: $(cat state/halted); remove deploy/state/halted once data/ is restored"
  exit 1
fi

resume

git fetch -q origin main || { echo "fetch failed"; exit 1; }
new=$(git rev-parse FETCH_HEAD)
old=$(git rev-parse HEAD)
[ "$new" = "$old" ] && exit 0

if ! git merge-base --is-ancestor "$old" "$new"; then
  echo "not a fast-forward of ${old:0:7}, not deploying"
  exit 1
fi

[ "$(cat state/refused 2>/dev/null)" = "$new" ] && exit 0

verdict=$(ci "$new") || { echo "GitHub API error"; exit 1; }
[ "$verdict" = pending ] && exit 0
case "$verdict" in
  passed|failed) ;;
  *) echo "GitHub API error"; exit 1 ;;
esac
echo "new commit ${new:0:7}"
if [ "$verdict" = failed ]; then
  refuse "$new"
  echo "CI failed on ${new:0:7}"
  exit 1
fi

if ! git diff --quiet HEAD; then
  echo "local changes in the checkout, not deploying"
  exit 1
fi

if ! docker tag "$IMAGE" "$IMAGE:previous"; then
  echo "tag failed for ${new:0:7}"
  exit 1
fi
mkdir -p state backups
name="$(date -u +%Y%m%dT%H%M%SZ)-${old:0:7}"
if ! deploying building; then
  docker tag "$IMAGE:previous" "$IMAGE"
  refuse "$new"
  echo "state write failed for ${new:0:7}"
  exit 1
fi
if ! git merge -q --ff-only "$new"; then
  docker tag "$IMAGE:previous" "$IMAGE"
  rm -f state/deploying
  refuse "$new"
  echo "checkout failed for ${new:0:7}"
  exit 1
fi
echo "building ${new:0:7}"
if ! compose build; then
  refuse "$new"
  # The building phase stays, so the next run's resume puts the old commit back.
  if ! git reset -q --hard "$old"; then
    echo "build failed for ${new:0:7}, checkout reset failed, will retry"
    exit 1
  fi
  docker tag "$IMAGE:previous" "$IMAGE"
  rm -f state/deploying
  echo "build failed for ${new:0:7}"
  exit 1
fi

deploying stopped || backup_failed
compose stop edward || backup_failed
as_root cp -a /data "/backups/$name" || backup_failed
# Past the copy, a failed write would leave a stopped phase, whose resume restarts the old version over data
# the new one may have migrated, so the old version is restarted now, before the new one ever starts.
deploying backed-up || backup_failed
echo "backed up data to backups/$name"
prune_copies

start_new
