#!/bin/sh
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$SCRIPT_DIR/scripts/run-macos.sh" sls:apply --config configs/p3-multiplication-algorithms.json --keep-originals "$@"
