#!/data/data/com.termux/files/usr/bin/bash
# Claude Code on Android: it has no Android build, so it runs in Debian through proot
# (`proot-distro install debian`), unpacked into ~/claude-bin by scripts/termux/setup.sh.
# The server uses this by default on Android (CLAUDE_CODE_PATH in config.js); Remote Control too.
args=()
while IFS='=' read -r k _; do
  case "$k" in CLAUDE*|ANTHROPIC*|MAX_MCP*|DISABLE_*) args+=(--env "$k=${!k}") ;; esac
done < <(env)
exec proot-distro login debian --work-dir "$PWD" "${args[@]}" -- "$HOME/claude-bin/package/claude" "$@"
