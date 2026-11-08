#!/data/data/com.termux/files/usr/bin/bash
# Keeps the server, the Cloudflare tunnel and Remote Control running on the phone: every
# minute it starts whichever has stopped. Started by scripts/termux/start.sh (and at boot
# through Termux:Boot). Its log and the tunnel's are in data/, whichever data set the server runs on.
cd "$(dirname "$(readlink -f "$0")")/../.."
ROOT=$PWD
LOG=$ROOT/data/watchdog.log
mkdir -p "$ROOT/data"
say() { echo "$(date '+%F %T') $*" >> "$LOG"; }
say "watchdog started"
while true; do
  # Also installs packages first if they changed (a git pull), as npm run server:start does everywhere.
  node scripts/restart-server.js start >> "$LOG" 2>&1 || say "server didn't start (see data/server.log)"
  if [ -s "$HOME/.cloudflared-token" ] && ! pgrep -f 'cloudflared tunnel' >/dev/null; then
    say "starting tunnel"
    TUNNEL_TOKEN=$(cat "$HOME/.cloudflared-token") setsid nohup cloudflared tunnel --no-autoupdate run >> "$ROOT/data/cloudflared.log" 2>&1 < /dev/null &
  fi
  if [ -x "$HOME/claude-bin/package/claude" ] && ! tmux has-session -t rc 2>/dev/null; then
    say "starting Remote Control"
    # Sessions never ask before acting (owner, 2026-11-08: the phone is disposable). Claude Code sees itself as root
    # inside proot and only skips permissions as root when told it is in a sandbox (IS_SANDBOX).
    IS_SANDBOX=1 tmux new-session -d -s rc -c "$ROOT" "IS_SANDBOX=1 bash $ROOT/scripts/termux/claude.sh remote-control --name Phone --spawn=same-dir --permission-mode bypassPermissions"
  fi
  sleep 60
done
