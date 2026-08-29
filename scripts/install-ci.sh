#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec bash "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v flock >/dev/null || {
  echo "install-ci.sh requires Linux flock." >&2
  exit 69
}
command -v timeout >/dev/null || {
  echo "install-ci.sh requires GNU timeout." >&2
  exit 69
}
command -v curl >/dev/null || {
  echo "install-ci.sh requires curl for the locked-tarball preflight." >&2
  exit 69
}
command -v sha256sum >/dev/null || {
  echo "install-ci.sh requires sha256sum for cache and install verification." >&2
  exit 69
}

runtime_root="${SITES_PROJECT_ROOT}/.sites-runtime"
expected_home="${runtime_root}/home"
expected_cache="${runtime_root}/npm-cache"

echo "[sites] validating writable install environment"
if [[ "${HOME}" != "${expected_home}" ]]; then
  echo "Expected HOME=${expected_home}, got HOME=${HOME}." >&2
  exit 78
fi
actual_cache="$(npm config get cache)"
if [[ "${actual_cache}" != "${expected_cache}" ]]; then
  echo "Expected npm cache ${expected_cache}, got ${actual_cache}." >&2
  exit 78
fi
touch "${HOME}/.sites-write-test" "${expected_cache}/.sites-write-test"
rm -f "${HOME}/.sites-write-test" "${expected_cache}/.sites-write-test"
echo "[sites] environment passed: HOME=${HOME}, cache=${expected_cache}"

lock_file="${runtime_root}/install.lock"
exec 9>"${lock_file}"
if ! flock -n 9; then
  echo "Another dependency install is already running for ${SITES_PROJECT_ROOT}." >&2
  exit 75
fi

for process in /proc/[0-9]*; do
  pid="${process##*/}"
  [[ "${pid}" != "$$" && "${pid}" != "${PPID}" ]] || continue
  process_cwd="$(readlink -f "${process}/cwd" 2>/dev/null || true)"
  [[ "${process_cwd}" == "${SITES_PROJECT_ROOT}" ]] || continue
  process_command="$(tr '\0' ' ' <"${process}/cmdline" 2>/dev/null || true)"
  if [[ "${process_command}" == *"npm ci"* ]]; then
    echo "Another npm ci is visible in ${SITES_PROJECT_ROOT}; refusing to overlap installs." >&2
    exit 75
  fi
done

lockfile_sha256="$(sha256sum "${SITES_PROJECT_ROOT}/package-lock.json" | awk '{print $1}')"
use_seeded_cache=0
seed_cache="${SITES_NPM_CACHE_SEED:-}"
if [[ -n "${seed_cache}" && -d "${seed_cache}" ]]; then
  seed_lockfile_sha256="$(cat "${seed_cache}/.sites-lockfile-sha256" 2>/dev/null || true)"
  if [[ "${seed_lockfile_sha256}" == "${lockfile_sha256}" ]]; then
    echo "[sites] restoring image-seeded npm cache"
    cp -a "${seed_cache}/." "${expected_cache}/"
    use_seeded_cache=1
    echo "[sites] image cache seed matched; registry fallback remains available"
  else
    echo "[sites] image cache seed does not match this lockfile; using the network path"
  fi
fi

registry_host="${SITES_NPM_REGISTRY_HOST:-registry.npmjs.org}"
registry_url="${SITES_NPM_REGISTRY_URL:-https://${registry_host}}"
network_available=0
if curl --silent --show-error --fail --head --connect-timeout 8 --max-time 15 "${registry_url}/" >/dev/null 2>&1; then
  network_available=1
fi

if [[ "${use_seeded_cache}" -eq 0 && "${network_available}" -eq 0 ]]; then
  echo "The npm registry is unavailable and no matching seeded cache was provided." >&2
  exit 69
fi

install_timeout="${SITES_INSTALL_TIMEOUT:-4m}"
install_kill_after="${SITES_INSTALL_KILL_AFTER:-10s}"
install_args=(ci --ignore-scripts --no-audit --no-fund)
if [[ "${network_available}" -eq 0 ]]; then
  install_args+=(--offline)
else
  install_args+=(--prefer-offline)
fi

echo "[sites] running npm ${install_args[*]} with timeout ${install_timeout}"
timeout --signal=TERM --kill-after="${install_kill_after}" "${install_timeout}" npm "${install_args[@]}"

if [[ ! -d "${SITES_PROJECT_ROOT}/node_modules" ]]; then
  echo "npm ci reported success but node_modules is missing." >&2
  exit 70
fi

installed_typescript="${SITES_PROJECT_ROOT}/node_modules/.bin/tsc"
installed_vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${installed_typescript}" || ! -x "${installed_vinext}" ]]; then
  echo "Expected project executables are missing after install." >&2
  exit 70
fi

printf '%s\n' "${lockfile_sha256}" >"${expected_cache}/.sites-lockfile-sha256"
echo "[sites] install verified"
