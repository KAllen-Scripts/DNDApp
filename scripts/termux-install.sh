#!/data/data/com.termux/files/usr/bin/bash
# Installs the server's packages on Android (Termux), in place of `npm install`.
# Run it from anywhere after each `git pull`, with the server stopped. See docs/hosting.md.
#
# Three packages have no Android build:
#   better-sqlite3    compiled here (needs: pkg install python clang make binutils)
#   sharp             its WebAssembly build
#   onnxruntime-node  replaced with onnxruntime-web, the WebAssembly build of the same thing
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")/.."
ROOT=$PWD

# --force: onnxruntime-node refuses Android otherwise. --ignore-scripts: as on every machine (docs/hosting.md).
npm install --ignore-scripts --force --no-audit --no-fund

echo "Compiling better-sqlite3 (a few minutes)..."
(
  cd node_modules/better-sqlite3
  GYP_DEFINES="android_ndk_path=''" JOBS=2 npm_config_nodedir="$PREFIX" \
    node "$PREFIX/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js" rebuild --release
)

# npm leaves these out because of their "cpu" field, so unpack them by hand.
unpack() { # <package> <version>
  local dir="$ROOT/node_modules/$1" tmp
  tmp=$(mktemp -d)
  (cd "$tmp" && npm pack "$1@$2" --silent >/dev/null)
  rm -rf "$dir"
  mkdir -p "$dir"
  tar xzf "$tmp"/*.tgz -C "$dir" --strip-components=1
  rm -rf "$tmp"
}
SHARP_WASM=$(node -p "require('./node_modules/sharp/package.json').optionalDependencies['@img/sharp-wasm32']")
unpack @img/sharp-wasm32 "$SHARP_WASM"
unpack @emnapi/runtime "$(node -p "require('./node_modules/@img/sharp-wasm32/package.json').dependencies['@emnapi/runtime']")"

cat > node_modules/onnxruntime-node/dist/index.js <<'JS'
// Written by scripts/termux-install.sh: Android has no native ONNX build.
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

for m in better-sqlite3 sharp @napi-rs/canvas @huggingface/transformers; do
  node --input-type=module -e "await import('$m'); console.log('ok: $m')"
done
echo "Done."
