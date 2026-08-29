#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
cd "${project_root}"

command -v timeout >/dev/null || {
  echo "run-tests.sh requires GNU timeout." >&2
  exit 69
}

run_test_file() {
  local test_file="$1"
  echo "[test] ${test_file}"
  timeout \
    --signal=TERM \
    --kill-after="${TEST_KILL_AFTER:-5s}" \
    "${TEST_FILE_TIMEOUT:-60s}" \
    node --import tsx "${test_file}"
}

for test_file in \
  tests/game-rules.test.ts \
  tests/architecture-contracts.test.ts \
  tests/runtime-contracts.test.ts \
  tests/camera-contracts.test.ts \
  tests/canvas3d-preview.test.ts \
  tests/rendered-html.test.mjs; do
  run_test_file "${test_file}"
done

echo "[test] all suites passed"
