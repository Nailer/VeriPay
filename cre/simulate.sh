#!/usr/bin/env bash
# Runs the auto-release workflow through the CRE simulator from a clean copy
# of this folder.
#
#   ./simulate.sh              dry run — reads the chain, sends nothing
#   ./simulate.sh --broadcast  real testnet write through Chainlink's forwarder
#
# Why a copy: run in place, inside the main app's repository, the compiled
# workflow traps at start-up ("failed to execute subscribe … wasm unreachable").
# The identical source runs correctly from a directory outside the repo. The
# cause isn't pinned down yet (it is not the code, the SDK version, the CLI
# version or the lockfile — each was ruled out), so this script sidesteps it.
#
# Needs: the CRE CLI (`cre login` done once) and Bun. For --broadcast, a
# funded testnet key in cre/.env as CRE_ETH_PRIVATE_KEY (see .env.example).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp "$here/project.yaml" "$here/secrets.yaml" "$work/"
mkdir "$work/auto-release"
cp "$here"/auto-release/{main.ts,workflow.ts,workflow.yaml,tsconfig.json,package.json,config.staging.json,config.production.json} "$work/auto-release/"
[ -f "$here/auto-release/bun.lock" ] && cp "$here/auto-release/bun.lock" "$work/auto-release/"
(cd "$work/auto-release" && bun install --silent)

env_flag=()
[ -f "$here/.env" ] && env_flag=(-e "$here/.env")

cd "$work"
cre workflow simulate auto-release --target staging-settings --non-interactive --trigger-index 0 "${env_flag[@]}" "$@"
