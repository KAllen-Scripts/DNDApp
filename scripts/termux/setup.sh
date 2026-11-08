#!/data/data/com.termux/files/usr/bin/bash
# One-time setup of a phone as the host (docs/hosting.md). Run in Termux from the repo:
#   bash scripts/termux/setup.sh
# Then: log Claude Code in (bash scripts/termux/claude.sh auth login), put the tunnel token
# in ~/.cloudflared-token, optionally build speech-to-text (bash scripts/termux/whisper.sh),
# and start everything (bash scripts/termux/start.sh). Install the Termux:Boot app (the same
# build as Termux: GitHub or F-Droid) and open it once so it all starts after a reboot. Then,
# from a PC with adb (or in Android's settings), so the boot job isn't held back and storage works:
#   adb shell dumpsys deviceidle whitelist +com.termux.boot   (and +com.termux): battery "Unrestricted"
#   adb shell pm grant com.termux.boot android.permission.READ_EXTERNAL_STORAGE
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."

pkg install -y git nodejs-lts python clang make binutils cmake cloudflared proot-distro tmux
[ -d "$PREFIX/var/lib/proot-distro/installed-rootfs/debian" ] || proot-distro install debian
bash scripts/termux/install.sh --force

mkdir -p "$HOME/.termux/boot" "$PWD/data"
# Self-contained: Termux:Boot's run may not get Termux's environment. Writes data/boot.log.
cat > "$HOME/.termux/boot/start-dndapp" <<BOOT
#!/system/bin/sh
P=/data/data/com.termux/files
echo "\$(date '+%F %T') boot" >> $PWD/data/boot.log
export PREFIX=\$P/usr HOME=\$P/home TMPDIR=\$P/usr/tmp LANG=en_US.UTF-8
export PATH=\$P/usr/bin:\$PATH LD_PRELOAD=\$P/usr/lib/libtermux-exec.so
\$P/usr/bin/termux-wake-lock >> $PWD/data/boot.log 2>&1
exec \$P/usr/bin/bash $PWD/scripts/termux/start.sh >> $PWD/data/boot.log 2>&1
BOOT
chmod 700 "$HOME/.termux/boot/start-dndapp"
echo "Set up. Next steps are at the top of this script."
