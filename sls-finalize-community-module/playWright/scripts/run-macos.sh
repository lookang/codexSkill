#!/bin/sh
set -u

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT" || exit 1

ACTION=${1:-}
if [ -z "$ACTION" ]; then
  printf '%s\n' "A package action is required."
  exit 2
fi
shift

pause_and_exit() {
  status=$1
  if [ -t 0 ] && [ "${SLS_NO_PAUSE:-0}" != "1" ]; then
    printf '\nPress Return when you are ready to close this window...'
    IFS= read -r _
  fi
  exit "$status"
}

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' "Node.js 20 or newer and npm are required. Install them, then run this launcher again."
  pause_and_exit 1
fi

install_and_check() {
  printf '%s\n' "Installing exact dependencies and validating the automation..."
  npm ci --cache .npm-cache && npm run check && npm test
}

if [ "$ACTION" = "setup" ]; then
  install_and_check
  pause_and_exit $?
fi

case "$ACTION" in
  sls:auth|sls:one-shot|sls:inspect|sls:apply|sls:resume|sls:gamify|sls:add-teacher|sls:thumbnail|sls:page-break|sls:remove-copy|sls:rename-titles|sls:revert-ast-titles|sls:acp-interactive|sls:gpt-interactive|sls:record|sls:selected|sls:smoke-actions) ;;
  *)
    printf 'Unsupported SLS action: %s\n' "$ACTION"
    pause_and_exit 2
    ;;
esac

if [ ! -d node_modules/@playwright/test ]; then
  install_and_check || pause_and_exit $?
fi

npm run "$ACTION" -- "$@"
pause_and_exit $?
