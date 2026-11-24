#!/usr/bin/env bash
# Build (incrementally) and run Ladybird with the Brave chrome. In a container with the host's Wayland socket
# passed in at /run/hostwl/wayland-0, the window shows on the host; otherwise on your own Wayland session.
#   ./scripts/run.sh [url...]
# Set BRAVE_CHROME=0 to run stock Ladybird. JOBS limits parallel compile jobs (default 4, ~2 GB RAM each).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

export PATH="$HOME/.cargo/bin:$PATH"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/xdg-$(id -u)}"
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"
if [ -S /run/hostwl/wayland-0 ]; then
    export WAYLAND_DISPLAY=/run/hostwl/wayland-0
fi
export QT_QPA_PLATFORM=wayland
export LADYBIRD_BRAVE_CHROME="${BRAVE_CHROME:-1}"

cd "$root/ladybird"
exec ./Meta/ladybird.py run -j "${JOBS:-4}" Ladybird "$@"
