#!/data/data/com.termux/files/usr/bin/bash
# Stops the watchdog first (or it would restart the rest), then the tunnel, the server and Remote Control.
# To restart only the server (after a git pull, say), use `npm run restart`: the watchdog leaves a running server alone.
cd "$(dirname "$(readlink -f "$0")")/../.."
pkill -f 'scripts/termux/watchdog.sh' && echo "Watchdog stopped."
pkill -f 'cloudflared tunnel' && echo "Tunnel stopped."
node scripts/restart-server.js stop
tmux kill-session -t rc 2>/dev/null && echo "Remote Control stopped."
termux-wake-unlock 2>/dev/null
true
