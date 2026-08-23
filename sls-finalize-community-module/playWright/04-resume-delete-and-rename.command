#!/bin/sh
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$SCRIPT_DIR/scripts/run-macos.sh" sls:resume --config configs/p3-multiplication-algorithms.json --delete-originals --rename-copies "$@"
