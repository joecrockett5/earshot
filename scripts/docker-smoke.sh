#!/usr/bin/env bash
# Builds the image, runs it, and checks the things that only show up in a real
# container: health, non-root process, clip upload, and data surviving a restart.
#
#   npm run docker:smoke
set -euo pipefail

IMAGE="${IMAGE:-earshot:smoke}"
NAME="earshot-smoke-$$"
PORT="${SMOKE_PORT:-18080}"
BASE="http://127.0.0.1:${PORT}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$(mktemp -d)"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "--- container logs ---"
    docker logs "$NAME" 2>&1 | tail -n 50 || true
  fi
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  # Files in the bind mount belong to the container's user; remove them from a container.
  docker run --rm -v "$DATA:/data" --entrypoint sh "$IMAGE" -c 'rm -rf /data/* /data/.[!.]*' >/dev/null 2>&1 || true
  rmdir "$DATA" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT

wait_healthy() {
  for _ in $(seq 1 60); do
    if curl -fsS "$BASE/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo "server did not become healthy" >&2
  return 1
}

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[process.argv[1]]))' "$1"; }

if [ -z "${SKIP_BUILD:-}" ]; then
  echo "==> build"
  docker build -t "$IMAGE" --build-arg VERSION=smoke "$ROOT"
fi

echo "==> run"
docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:8080" -v "$DATA:/data" "$IMAGE" >/dev/null
wait_healthy
curl -fsS "$BASE/api/health"; echo

echo "==> runs as non-root"
user="$(docker exec "$NAME" sh -c 'cat /proc/1/status | grep "^Uid:" | awk "{print \$2}"')"
[ "$user" = "1000" ] || { echo "server is running as uid $user" >&2; exit 1; }

echo "==> serves the web app"
curl -fsS "$BASE/" | grep -q '<div id="root">'

echo "==> upload a clip"
clip_id="$(curl -fsS -F "file=@$ROOT/apps/web/public/demo/knock.wav;type=audio/wav" "$BASE/api/clips" | json id)"
[ -n "$clip_id" ] && [ "$clip_id" != "undefined" ]
curl -fsS -o /dev/null "$BASE/api/clips/$clip_id"

echo "==> rejects a file that is not audio"
code="$(printf 'not audio at all, just text' | curl -s -o /dev/null -w '%{http_code}' -F 'file=@-;filename=x.wav;type=audio/wav' "$BASE/api/clips")"
[ "$code" = "415" ] || { echo "expected 415, got $code" >&2; exit 1; }

echo "==> create a sound that uses the clip"
body="$(printf '{"name":"Smoke","sources":[{"id":"%032d","clipId":"%s","label":"Knock","angle":180,"distance":2,"startOffset":0,"gain":1,"loop":false,"duration":1.1}]}' 1 "$clip_id")"
sound_id="$(curl -fsS -H 'content-type: application/json' -d "$body" "$BASE/api/sounds" | json id)"

echo "==> data survives a restart"
docker restart "$NAME" >/dev/null
wait_healthy
[ "$(curl -fsS "$BASE/api/sounds/$sound_id" | json name)" = "Smoke" ]
curl -fsS -o /dev/null "$BASE/api/clips/$clip_id"

echo "==> container healthcheck"
for _ in $(seq 1 40); do
  health="$(docker inspect -f '{{.State.Health.Status}}' "$NAME")"
  [ "$health" = "healthy" ] && break
  sleep 1
done
[ "$health" = "healthy" ] || { echo "healthcheck is $health" >&2; exit 1; }

echo "smoke test passed"
