#!/bin/sh
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$SCRIPT_DIR/scripts/run-macos.sh" sls:inspect --config configs/p3-multiplication-algorithms.json "$@"
