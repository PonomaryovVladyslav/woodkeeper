#!/usr/bin/env bash
# Deploy an image tag from GHCR to the server: deploy/deploy.sh [TAG]
#   DEPLOY_HOST=ubuntu@<host>  (required)
#   DEPLOY_KEY=~/path/key.pem  (optional, ssh -i)
set -euo pipefail

TAG="${1:-latest}"
HOST="${DEPLOY_HOST:?set DEPLOY_HOST, e.g. ubuntu@ec2-....compute.amazonaws.com}"
IMAGE="ghcr.io/ponomaryovvladyslav/woodkeeper"
DIR="/opt/woodkeeper"
SSH=(ssh)
SCP=(scp)
if [[ -n "${DEPLOY_KEY:-}" ]]; then
  SSH+=(-i "$DEPLOY_KEY")
  SCP+=(-i "$DEPLOY_KEY")
fi
cd "$(dirname "$0")"

echo "==> Checking that $IMAGE:$TAG exists"
docker manifest inspect "$IMAGE:$TAG" >/dev/null

echo "==> Copying compose, Caddy config and scripts"
"${SCP[@]}" -q -r docker-compose.yml caddy backup.sh "$HOST:$DIR/"

echo "==> Pulling and starting $TAG"
"${SSH[@]}" "$HOST" bash -s -- "$DIR" "$TAG" <<'REMOTE'
set -euo pipefail
cd "$1"
# Remember the tag, so a later `docker compose up` keeps this version.
if grep -q '^TAG=' .env; then sed -i "s/^TAG=.*/TAG=$2/" .env; else echo "TAG=$2" >> .env; fi
chmod +x backup.sh
docker compose pull --quiet
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
REMOTE

DOMAIN="$("${SSH[@]}" "$HOST" "grep '^DOMAIN=' $DIR/.env | cut -d= -f2-")"
echo "==> Waiting for https://$DOMAIN/api/health"
for _ in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "    healthy"
    break
  fi
  sleep 2
done
curl -fsS "https://$DOMAIN/api/health" >/dev/null || { echo "!! health check failed"; FAILED=1; }

"${SSH[@]}" "$HOST" "cd $DIR && docker compose ps && docker compose logs --tail=20 app"
exit "${FAILED:-0}"
