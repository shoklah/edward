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

deploying() {
  echo "$old $new $name $1" > state/deploying
}

# Removes all but the KEEP newest copies, counting the one just taken.
prune_copies() {
  set -- $(ls -1 backups | grep -vxF "$name" | sort)
  while [ "$#" -ge "$KEEP" ]; do
    as_root rm -rf "/backups/$1"
    shift
  done
}

# The stop or the copy failed: the old version is started again and the new commit refused.
backup_failed() {
  as_root rm -rf "/backups/$name"
  git reset -q --hard "$old"
  docker tag "$IMAGE:previous" "$IMAGE"
  compose up -d --no-build edward
  refuse "$new"
  rm -f state/deploying
  echo "backup failed, ${old:0:7} restarted"
  exit 1
}

# Task 3: picks up a deploy that a killed run left in state/deploying.
resume() {
  :
}

# Task 3: puts back the data and the old version after a failed health check.
rollback() {
  exit 1
}

if [ -z "${EDWARD_PUBLIC_HOST:-}" ]; then
  echo "EDWARD_PUBLIC_HOST is not set"
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
echo "new commit ${new:0:7}"
if [ "$verdict" = failed ]; then
  refuse "$new"
  echo "CI failed on ${new:0:7}"
  exit 1
fi

mkdir -p state backups
name="$(date -u +%Y%m%dT%H%M%SZ)-${old:0:7}"
docker tag "$IMAGE" "$IMAGE:previous"
deploying building
git merge -q --ff-only "$new"
echo "building ${new:0:7}"
if ! compose build; then
  git reset -q --hard "$old"
  docker tag "$IMAGE:previous" "$IMAGE"
  refuse "$new"
  rm -f state/deploying
  echo "build failed for ${new:0:7}"
  exit 1
fi

deploying stopped
compose stop edward || backup_failed
as_root cp -a /data "/backups/$name" || backup_failed
deploying backed-up
echo "backed up data to backups/$name"
prune_copies

compose up -d --no-build edward
echo "started ${new:0:7}"
if ! healthy; then
  echo "health check failed for ${new:0:7}, rolling back"
  rollback
fi
echo "deployed ${new:0:7}"
rm -f state/deploying
docker image prune -f
