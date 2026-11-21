#!/usr/bin/env bash
set -euo pipefail

image="${1:-agentbench:local}"
project="agentbench-smoke-$$"
temporary="$(mktemp -d)"
deployment="$temporary/agentbench"
mkdir "$deployment"
cp compose.yaml "$deployment/compose.yaml"

export AGENTBENCH_IMAGE="$image" AGENTBENCH_PORT=0 AGENTBENCH_BIND=127.0.0.1 AGENTBENCH_SEED=0
if [ "$(id -u)" -ne 0 ] && [ "$(id -g)" -ne 0 ]; then
  export AGENTBENCH_UID="$(id -u)" AGENTBENCH_GID="$(id -g)"
fi

compose() {
  docker compose -p "$project" --project-directory "$deployment" -f "$deployment/compose.yaml" "$@"
}
cleanup() {
  if [ "$?" -ne 0 ]; then compose logs --no-color; fi
  compose down --remove-orphans
  rm -rf "$temporary"
}
trap cleanup EXIT

compose up -d --wait --wait-timeout 40
test -f "$deployment/.env"
test -f "$deployment/data/agentbench.sqlite"
grep -Fx "AGENTBENCH_IMAGE=$image" "$deployment/.env"
printf '\n# Kept on restart\n' >> "$deployment/.env"
cp "$deployment/.env" "$temporary/env.before"

compose exec -T app node --input-type=module - <<'NODE'
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const base = 'http://127.0.0.1:4173/api';
const catalog = await fetch(base + '/catalog').then(response => response.json());
assert.equal(catalog.scenarios.length, 6);
const result = await fetch(base + '/runs', {
  method: 'POST',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({mode: 'demo', models: ['Demo Operator'], scenarios: ['support'], languages: ['en', 'de'], maxTurns: 8}),
});
assert.equal(result.status, 202);
const {ids} = await result.json();
for (let i = 0; i < 60; i++) {
  const run = await fetch(base + '/runs/' + ids[0]).then(response => response.json());
  if (run.status === 'completed') break;
  if (i === 59) throw new Error('Demo benchmark did not complete');
  await delay(100);
}
NODE

compose down
compose up -d --wait --wait-timeout 40
cmp "$deployment/.env" "$temporary/env.before"
compose exec -T app node --input-type=module - <<'NODE'
import assert from 'node:assert/strict';
const {runs} = await fetch('http://127.0.0.1:4173/api/runs').then(response => response.json());
assert.equal(runs.length, 1);
assert.equal(runs[0].status, 'completed');
assert.equal(runs[0].summary.total, 2);
NODE
printf 'Compose created .env and data, kept .env unchanged, and retained the bilingual run across container recreation.\n'
