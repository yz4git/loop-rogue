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
  local budget="${2:-${TEST_FILE_TIMEOUT:-60s}}"
  echo "[test] ${test_file} (budget ${budget})"
  timeout \
    --signal=TERM \
    --kill-after="${TEST_KILL_AFTER:-5s}" \
    "${budget}" \
    node --import tsx "${test_file}"
}

run_test_file tests/game-rules.test.ts
run_test_file tests/architecture-contracts.test.ts
run_test_file tests/runtime-contracts.test.ts
run_test_file tests/camera-contracts.test.ts
run_test_file tests/canvas3d-preview.test.ts
run_test_file tests/worldgen-contracts.test.ts "${WORLDGEN_CONTRACT_TIMEOUT:-150s}"
run_test_file tests/rendered-html.test.mjs

echo "[test] all suites passed"
