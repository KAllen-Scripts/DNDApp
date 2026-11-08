#!/data/data/com.termux/files/usr/bin/bash
# One-time setup of a phone as the host (docs/hosting.md). Run in Termux from the repo:
#   bash scripts/termux/setup.sh
# Then: log Claude Code in (bash scripts/termux/claude.sh auth login), put the tunnel token
# in ~/.cloudflared-token, optionally build speech-to-text (bash scripts/termux/whisper.sh),
# and start everything (bash scripts/termux/start.sh). Install the Termux:Boot app (the same
# build as Termux: GitHub or F-Droid) and open it once so it all starts after a reboot.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/../.."

pkg install -y git nodejs-lts python clang make binutils cmake cloudflared proot-distro tmux
[ -d "$PREFIX/var/lib/proot-distro/installed-rootfs/debian" ] || proot-distro install debian
bash scripts/termux/install.sh --force

mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/start-dndapp" <<BOOT
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
exec bash "$PWD/scripts/termux/start.sh"
BOOT
chmod 700 "$HOME/.termux/boot/start-dndapp"
echo "Set up. Next steps are at the top of this script."
