#!/bin/sh
# Installs the built release (ui/dist) into a throwaway Prusa Connect core, the
# way an operator would, and fails unless the core accepts it.
#
#   sh scripts/install-check.sh <prusa-connect binary>
set -eu

core=${1:?usage: install-check.sh <prusa-connect binary>}
root=$(cd "$(dirname "$0")/.." && pwd)
version=$(sed -n 's/^version: *//p' "$root/module.yaml")

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/config.d"
cat > "$tmp/config.yaml" <<EOF
core:
  overlay: $tmp/resources.json
  modules: $tmp/modules
  authz:
    database: $tmp/config.d/authz.db
EOF

out=$("$core" module add "github.com/rajtslegr/printer-keys@$version" \
  -from "$root/ui/dist" -config "$tmp/config.yaml" -approve 2>&1) || {
  echo "$out"
  exit 1
}
echo "$out"
case $out in
  *installed*) ;;
  *) echo "FAIL the core did not report the module installed" >&2; exit 1 ;;
esac
