#!/usr/bin/env bash
#
# codex-sandbox-doctor.sh — diagnose (and optionally repair) the bubblewrap
# sandbox failure that makes `codex review` unusable on the VPS (waifufun#690).
#
# Symptom:
#   bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted
#
# Root cause: when Codex sandboxes a command it unshares a fresh network
# namespace and brings up the loopback interface inside it. Configuring `lo`
# requires the netlink op RTM_NEWADDR, which needs CAP_NET_ADMIN *inside the
# user namespace*. Many VPS/container hosts (LXC, OpenVZ, seccomp-confined
# Docker, AppArmor-confined userns) drop that capability or block the netlink
# call, so the unshare succeeds but the loopback setup fails.
#
# This script is READ-ONLY by default. It prints a diagnosis and a recommended
# fix. Pass --install to apt-install system bubblewrap (the one mutating action,
# and only that). Everything else is left for the operator to apply knowingly.
#
# Usage:
#   ./scripts/codex-sandbox-doctor.sh            # diagnose only
#   ./scripts/codex-sandbox-doctor.sh --install  # diagnose + apt install bubblewrap
#
# Exit codes:
#   0  sandbox networking works (or was made to work)
#   1  sandbox networking is broken; see the printed recommendation
#   2  bubblewrap not available to test with

set -uo pipefail

INSTALL=0
for arg in "$@"; do
	case "$arg" in
		--install) INSTALL=1 ;;
		-h | --help)
			sed -n '2,30p' "$0"
			exit 0
			;;
		*)
			echo "unknown arg: $arg" >&2
			exit 64
			;;
	esac
done

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; }

bold "== codex sandbox doctor (waifufun#690) =="
echo

# --- 1. host / virtualization -------------------------------------------------
bold "1. host"
if command -v systemd-detect-virt >/dev/null 2>&1; then
	VIRT="$(systemd-detect-virt 2>/dev/null || echo unknown)"
	echo "  virtualization: ${VIRT}"
	case "$VIRT" in
		lxc | openvz | lxc-libvirt)
			warn "container-type virtualization often blocks netns loopback setup even with userns enabled"
			;;
	esac
else
	echo "  virtualization: (systemd-detect-virt not available)"
fi
echo "  kernel: $(uname -r)"
echo

# --- 2. user namespace sysctls ------------------------------------------------
bold "2. user-namespace sysctls"
read_sysctl() {
	local key="$1"
	if [[ -r "/proc/sys/${key//.//}" ]]; then
		cat "/proc/sys/${key//.//}"
	else
		echo "unset"
	fi
}
UNPRIV_CLONE="$(read_sysctl kernel.unprivileged_userns_clone)"
MAX_USERNS="$(read_sysctl user.max_user_namespaces)"
echo "  kernel.unprivileged_userns_clone = ${UNPRIV_CLONE}"
echo "  user.max_user_namespaces         = ${MAX_USERNS}"
if [[ "$UNPRIV_CLONE" == "0" ]]; then
	bad "unprivileged userns cloning is DISABLED — bwrap cannot create any namespace"
elif [[ "$MAX_USERNS" == "0" ]]; then
	bad "max_user_namespaces is 0 — userns creation is blocked"
elif [[ "$UNPRIV_CLONE" == "unset" && "$MAX_USERNS" == "unset" ]]; then
	warn "userns sysctls are not readable on this host; rely on the live bwrap probe below"
else
	ok "userns creation looks permitted"
fi
echo

# --- 3. bubblewrap binary -----------------------------------------------------
bold "3. bubblewrap binary"
SYS_BWRAP="$(command -v bwrap 2>/dev/null || true)"
if [[ -n "$SYS_BWRAP" ]]; then
	ok "system bwrap: ${SYS_BWRAP} ($("$SYS_BWRAP" --version 2>/dev/null || echo '?'))"
	BWRAP="$SYS_BWRAP"
else
	warn "no system bwrap on PATH; Codex uses its vendored copy"
	BWRAP=""
fi
echo

# --- 4. reproduce the failing operation --------------------------------------
bold "4. reproduce sandbox networking"
if [[ -z "$BWRAP" ]]; then
	warn "cannot run the live probe without a bwrap binary on PATH"
	warn "the vendored bwrap inside Codex is what actually fails; install system bwrap to probe (--install)"
	NET_RESULT="unknown"
else
	# This mirrors what Codex does: unshare a net namespace (which forces
	# loopback bring-up). If this prints the RTM_NEWADDR error, we've reproduced
	# the bug. Then we test the --share-net workaround.
	echo "  probe A: --unshare-all (forces loopback setup, expected to fail on broken hosts)"
	if PROBE_A="$("$BWRAP" --unshare-all --dev-bind / / true 2>&1)"; then
		ok "    --unshare-all succeeded — sandbox networking is healthy"
		NET_RESULT="ok"
	else
		bad "    --unshare-all failed:"
		printf '       %s\n' "$PROBE_A"
		NET_RESULT="broken"

		echo "  probe B: --unshare-user --unshare-pid (no net namespace; the workaround)"
		if PROBE_B="$("$BWRAP" --unshare-user --unshare-pid --dev-bind / / true 2>&1)"; then
			ok "    succeeds without unsharing the network — '--share-net' style workaround is viable"
			NET_RESULT="broken_but_sharenet_ok"
		else
			bad "    also failed:"
			printf '       %s\n' "$PROBE_B"
		fi
	fi
fi
echo

# --- 5. AppArmor --------------------------------------------------------------
bold "5. AppArmor"
if command -v aa-status >/dev/null 2>&1; then
	if aa-status --enabled 2>/dev/null; then
		warn "AppArmor is enabled; a userns-restricting profile can block bwrap even when sysctls allow it"
		if [[ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]]; then
			RESTRICT="$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns)"
			echo "    kernel.apparmor_restrict_unprivileged_userns = ${RESTRICT}"
			[[ "$RESTRICT" == "1" ]] && bad "    AppArmor is restricting unprivileged userns — this alone breaks bwrap"
		fi
	else
		ok "AppArmor present but not enabled"
	fi
else
	ok "no aa-status (AppArmor tools not installed)"
fi
echo

# --- 6. optional install ------------------------------------------------------
if [[ "$INSTALL" == "1" ]]; then
	bold "6. install system bubblewrap"
	if [[ -n "$SYS_BWRAP" ]]; then
		ok "system bwrap already installed; nothing to do"
	elif command -v apt-get >/dev/null 2>&1; then
		echo "  running: sudo apt-get update && sudo apt-get install -y bubblewrap"
		if sudo apt-get update && sudo apt-get install -y bubblewrap; then
			ok "installed; re-run this script without --install to re-probe"
		else
			bad "install failed; install bubblewrap manually for your distro"
		fi
	else
		warn "apt-get not found; install the 'bubblewrap' package via your distro's package manager"
	fi
	echo
fi

# --- diagnosis ----------------------------------------------------------------
bold "== recommendation =="
case "$NET_RESULT" in
	ok)
		ok "sandbox networking works. If 'codex review' still fails, install system bubblewrap"
		ok "(--install) so Codex stops using its older vendored copy, then retry."
		exit 0
		;;
	broken_but_sharenet_ok)
		cat <<'EOF'
  The host blocks loopback setup inside a new network namespace, but bwrap
  works when it does NOT unshare the network. Two ways forward:

    1. On a host you trust, run the review without the sandbox so bwrap never
       unshares the network. NOTE: `codex review` has no --sandbox flag, and
       the `workspace-write` mode still sandboxes (still unshares net, so it
       still fails here). The only mode that skips the sandbox is
       `danger-full-access`, passed as a config override:
         codex review --uncommitted -c sandbox_mode="danger-full-access"
       This removes the sandbox boundary — only use it where the diff is
       trusted (e.g. your own branch on a host you control).

    2. Better long-term: move the review to a host that supports user+network
       namespaces. See docs/codex-review-vps.md "Fallback review runner".
EOF
		exit 1
		;;
	broken)
		cat <<'EOF'
  Sandbox networking is broken and the no-netns workaround also failed, which
  points at the host denying userns/netns operations outright (common on LXC/
  OpenVZ or AppArmor-restricted hosts). Options, in order of preference:

    1. If AppArmor restricts unprivileged userns (section 5 flagged it):
         echo 0 | sudo tee /proc/sys/kernel/apparmor_restrict_unprivileged_userns
       and persist via /etc/sysctl.d/. Re-run this doctor.

    2. Install system bubblewrap (--install) and retry; the vendored copy may
       predate fixes for constrained hosts.

    3. If the host genuinely cannot support sandboxing (container virt that
       blocks netns), DO NOT bypass the sandbox here. Instead run Codex review
       on a capable host — see docs/codex-review-vps.md "Fallback review runner".
EOF
		exit 1
		;;
	unknown)
		cat <<'EOF'
  Could not run the live probe because no bwrap binary is on PATH. Install
  system bubblewrap first:
       ./scripts/codex-sandbox-doctor.sh --install
  then re-run this script to get a concrete diagnosis.
EOF
		exit 2
		;;
esac
