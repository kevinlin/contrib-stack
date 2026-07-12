#!/bin/sh

"$@" &
child_pid=$!

forward_signal() {
  kill -TERM "$child_pid" 2>/dev/null || true
}

trap forward_signal TERM INT

set +e
wait "$child_pid"
status=$?
set -e

if [ "$status" -eq 143 ]; then
  exit 0
fi

exit "$status"
