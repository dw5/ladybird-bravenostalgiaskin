#!/usr/bin/env bash
# Build the Brave chrome bundle (chrome/) and copy it into Ladybird's about-page resources.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

cd "$root/chrome"
[ -d node_modules ] || npm ci --no-audit --no-fund
npm run ladybird

dest="$root/ladybird/Base/res/ladybird/about-pages/brave"
mkdir -p "$dest"
cp "$root/chrome/dist-ladybird/brave-chrome.js" "$root/chrome/dist-ladybird/brave-about.js" "$dest/"
echo "Copied brave-chrome.js and brave-about.js to $dest"
