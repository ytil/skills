#!/usr/bin/env bash
# youtube-notes skill — one-shot environment setup / restore.
#
#     bash scripts/init.sh
#
# Idempotent: safe to run repeatedly. It verifies Node, provisions the CLI tools
# the scripts shell out to (yt-dlp, ffmpeg), and RESTORES the npm dependency (jimp)
# that is gitignored and therefore absent after a fresh clone.
#
# Cross-platform (macOS + Linux): the CLI tools are installed via whichever package
# manager is present — Homebrew on macOS, or apt/dnf/yum/pacman/zypper/apk on Linux
# (with sudo when not root). It never installs or upgrades Node itself (that belongs
# to your version manager — nvm/fnm/asdf/brew) and never installs a package manager:
# if none is found it prints the exact command and stops.
#
# Exit code is 0 only when everything the skill needs is present.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
MIN_NODE="22.18"
missing=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m→\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- Node (check only — never auto-install/upgrade; respects nvm/fnm/asdf) ---
printf 'Node.js (>= %s):\n' "$MIN_NODE"
if have node; then
    node_ver="$(node -v)"
    if node -e 'const v=process.versions.node.split(".").map(Number);process.exit((v[0]>22||(v[0]===22&&v[1]>=18))?0:1)'; then
        ok "node $node_ver"
    else
        bad "node $node_ver is too old (need >= $MIN_NODE) — upgrade via nvm/fnm/asdf or: brew install node"
        missing=1
    fi
else
    bad "node not found — install Node >= $MIN_NODE (nvm/fnm/asdf, or: brew install node)"
    missing=1
fi

# --- CLI tools (yt-dlp, ffmpeg) via the platform package manager ---
# yt-dlp and ffmpeg share the same package name across brew/apt/dnf/pacman/zypper/apk,
# so one detected install command handles every platform. (Note: on Fedora/openSUSE a
# full ffmpeg may need RPM Fusion / Packman enabled — the failure is reported if so.)
printf '\nCLI tools (yt-dlp, ffmpeg):\n'
sudo_pfx=""
[ "$(id -u)" -ne 0 ] && have sudo && sudo_pfx="sudo "
if   have brew;    then pm_install="brew install"
elif have apt-get; then pm_install="${sudo_pfx}apt-get install -y"
elif have dnf;     then pm_install="${sudo_pfx}dnf install -y"
elif have yum;     then pm_install="${sudo_pfx}yum install -y"
elif have pacman;  then pm_install="${sudo_pfx}pacman -S --noconfirm"
elif have zypper;  then pm_install="${sudo_pfx}zypper install -y"
elif have apk;     then pm_install="${sudo_pfx}apk add"
else pm_install=""
fi
for tool in yt-dlp ffmpeg; do
    if have "$tool"; then
        ok "$tool ($(command -v "$tool"))"
    elif [ -n "$pm_install" ]; then
        warn "$tool missing — installing via: $pm_install $tool"
        # Word-splitting of $pm_install is intended: it's a command built from literals.
        if $pm_install "$tool"; then
            ok "$tool installed"
        else
            bad "$tool: '$pm_install $tool' failed — see the output above"
            missing=1
        fi
    else
        bad "$tool missing and no supported package manager found (brew/apt/dnf/yum/pacman/zypper/apk) — install $tool manually"
        missing=1
    fi
done

# --- npm dependency (jimp) — the "restore after clone" case ---
printf '\nnpm dependencies (jimp):\n'
if have npm; then
    if [ -d "$SCRIPT_DIR/node_modules/jimp" ]; then
        ok "jimp already installed"
    else
        warn "restoring via npm install..."
        if (cd "$SCRIPT_DIR" && npm install --no-fund --no-audit); then
            ok "jimp installed"
        else
            bad "npm install failed — run it manually in $SCRIPT_DIR"
            missing=1
        fi
    fi
else
    bad "npm not found (ships with Node) — install Node >= $MIN_NODE"
    missing=1
fi

printf '\n'
if [ "$missing" = 0 ]; then
    ok "youtube-notes is ready."
    exit 0
else
    bad "Some dependencies are missing — see the ✗ lines above."
    exit 1
fi
