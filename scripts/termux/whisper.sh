#!/data/data/com.termux/files/usr/bin/bash
# Speech-to-text for Discord recordings on a phone: builds whisper.cpp in ~/whisper.cpp and
# downloads a model. config.js uses these by default on Android (TRANSCRIBE_ENGINE=whisper-cpp).
#   bash scripts/termux/whisper.sh            the base.en model (~140 MB): English, fits a small phone
#   bash scripts/termux/whisper.sh small.en   better but about 3x slower (then set WHISPER_CPP_MODEL)
set -euo pipefail
MODEL=${1:-base.en}
TAG=v1.9.5 # a whisper.cpp release; change to update
DIR=$HOME/whisper.cpp

[ -d "$DIR" ] || git clone --depth 1 --branch "$TAG" https://github.com/ggml-org/whisper.cpp.git "$DIR"
cd "$DIR"
cmake -B build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
cmake --build build -j 2 --target whisper-cli
mkdir -p models
[ -s "models/ggml-$MODEL.bin" ] || curl -fL -o "models/ggml-$MODEL.bin" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL.bin"
build/bin/whisper-cli -m "models/ggml-$MODEL.bin" -f samples/jfk.wav -np 2>/dev/null | tail -2
echo "whisper.cpp is ready: $DIR/build/bin/whisper-cli with models/ggml-$MODEL.bin"
