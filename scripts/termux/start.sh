#!/data/data/com.termux/files/usr/bin/bash
# Starts the watchdog, which starts and keeps up the server, the tunnel and Remote Control.
# Termux:Boot runs this at boot (~/.termux/boot/start-dndapp, made by setup.sh).
termux-wake-lock 2>/dev/null
if pgrep -f 'scripts/termux/watchdog.sh' >/dev/null; then
  echo "Already running."
else
  setsid nohup bash "$(dirname "$(readlink -f "$0")")/watchdog.sh" > /dev/null 2>&1 < /dev/null &
  echo "Started. The server, tunnel and Remote Control come up within a minute (log: data/watchdog.log)."
fi
