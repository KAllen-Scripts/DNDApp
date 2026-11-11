#!/data/data/com.termux/files/usr/bin/bash
# Installs the server's packages on Android (Termux), in place of `npm install`.
# npm run restart / server:start run it by themselves on Android (scripts/restart-server.js).
# It does nothing when package-lock.json and Node haven't changed since it last worked;
# `--force` runs it anyway. See docs/hosting.md.
#
# Three packages have no Android build:
#   better-sqlite3    compiled here (needs: pkg install python clang make binutils)
#   sharp             its WebAssembly build
#   onnxruntime-node  replaced with onnxruntime-web, the WebAssembly build of the same thing
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")/../.."
ROOT=$PWD
STAMP=node_modules/.termux-install
want="$(sha256sum package-lock.json | cut -d' ' -f1) $(node -v)"
if [ "${1:-}" != "--force" ] && [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$want" ]; then
  echo "Packages are up to date."
  exit 0
fi
rm -f "$STAMP"

# --force: onnxruntime-node refuses Android otherwise. --ignore-scripts: as on every machine (docs/hosting.md).
npm install --ignore-scripts --force --no-audit --no-fund

echo "Compiling better-sqlite3 (a few minutes)..."
(
  cd node_modules/better-sqlite3
  GYP_DEFINES="android_ndk_path=''" JOBS=2 npm_config_nodedir="$PREFIX" \
    node "$PREFIX/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js" rebuild --release
)

# npm leaves these out on Android, so unpack them by hand. sharp's WebAssembly build shares its version.
unpack() { # <package> <version>
  local dir="$ROOT/node_modules/$1" tmp
  tmp=$(mktemp -d)
  (cd "$tmp" && npm pack "$1@$2" --loglevel=error >/dev/null)
  rm -rf "$dir"
  mkdir -p "$dir"
  tar xzf "$tmp"/*.tgz -C "$dir" --strip-components=1
  rm -rf "$tmp"
}
unpack @img/sharp-wasm32 "$(node -p "require('./node_modules/sharp/package.json').version")"
unpack @emnapi/runtime "$(node -p "require('./node_modules/@img/sharp-wasm32/package.json').dependencies['@emnapi/runtime']")"

cat > node_modules/onnxruntime-node/dist/index.js <<'JS'
// Written by scripts/termux/install.sh: Android has no native ONNX build.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ort = require('onnxruntime-web');
const dist = path.dirname(require.resolve('onnxruntime-web'));
ort.env.wasm.wasmPaths = {
  mjs: pathToFileURL(path.join(dist, 'ort-wasm-simd-threaded.mjs')).href,
  wasm: pathToFileURL(path.join(dist, 'ort-wasm-simd-threaded.wasm')).href,
};
module.exports = ort;
JS

# Claude Code for scripts/termux/claude.sh: the Linux ARM build that matches the Agent SDK's version.
SDK=$(node -p "require('./node_modules/@anthropic-ai/claude-agent-sdk/package.json').version")
if [ "$(cat "$HOME/claude-bin/.version" 2>/dev/null)" != "$SDK" ]; then
  echo "Unpacking Claude Code $SDK..."
  rm -rf "$HOME/claude-bin/package"
  mkdir -p "$HOME/claude-bin"
  (cd "$HOME/claude-bin" && tar xzf "$(npm pack "@anthropic-ai/claude-agent-sdk-linux-arm64@$SDK" --loglevel=error)" && rm -f ./*.tgz)
  chmod 755 "$HOME/claude-bin/package/claude"
  echo "$SDK" > "$HOME/claude-bin/.version"
fi

for m in better-sqlite3 sharp @napi-rs/canvas @huggingface/transformers @discordjs/voice; do
  node --input-type=module -e "await import('$m'); console.log('ok: $m')"
done
echo "$want" > "$STAMP"
echo "Done."
