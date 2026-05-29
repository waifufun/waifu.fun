# Codex review on the VPS (bubblewrap sandbox)

`codex review` sandboxes every command it runs with [bubblewrap](https://github.com/containers/bubblewrap)
(`bwrap`). On the review VPS that sandbox fails before it can inspect any
files:

```
bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted
```

Because the review attempt aborts, PRs end up effectively self-reviewed. This
doc explains why it happens, how to diagnose it, and the fallback when the host
simply cannot run the sandbox. Tracked in waifufun#690.

## Why it fails

When Codex sandboxes a command it unshares a fresh **network namespace** and
brings up the loopback (`lo`) interface inside it. Configuring `lo` issues the
netlink operation `RTM_NEWADDR`, which requires `CAP_NET_ADMIN` **inside the
user namespace**. Many VPS/container hosts deny that capability or block the
netlink call even when unprivileged user namespaces are otherwise enabled:

- LXC / OpenVZ-style virtualization that restricts network-namespace ops
- seccomp-confined Docker hosts
- AppArmor with `kernel.apparmor_restrict_unprivileged_userns = 1` (Ubuntu 24.04+)

So the namespace unshare succeeds, but the loopback setup that follows is
rejected — hence the `RTM_NEWADDR: Operation not permitted` error. The sysctls
the original investigation checked (`unprivileged_userns_clone = 1`,
`max_user_namespaces = 125196`) are necessary but not sufficient: they permit
*creating* the namespace, not *configuring the network* inside it.

## Diagnose

Run the doctor script from the repo root on the affected host:

```bash
./scripts/codex-sandbox-doctor.sh
```

It is read-only by default and reports:

1. virtualization type and kernel version
2. the userns sysctls
3. whether a system `bwrap` exists (vs. Codex's vendored copy)
4. a live reproduction of the failing `--unshare-all` op, plus whether the
   no-network-namespace variant works (the workaround signal)
5. whether AppArmor is restricting unprivileged userns

It ends with a concrete recommendation keyed to what it found. To also install
system bubblewrap (the only mutating action it will take):

```bash
./scripts/codex-sandbox-doctor.sh --install
```

## Fixes, in order of preference

1. **AppArmor userns restriction** (if section 5 of the doctor flags it):

   ```bash
   echo 0 | sudo tee /proc/sys/kernel/apparmor_restrict_unprivileged_userns
   # persist:
   echo 'kernel.apparmor_restrict_unprivileged_userns = 0' | \
     sudo tee /etc/sysctl.d/60-codex-userns.conf
   sudo sysctl --system
   ```

   Re-run the doctor; this alone fixes Ubuntu 24.04+ hosts.

2. **Install system bubblewrap** and retry. Codex falls back to a vendored
   `bwrap` that may predate fixes for constrained hosts:

   ```bash
   sudo apt-get update && sudo apt-get install -y bubblewrap
   ```

3. **Run without the sandbox** so bwrap never unshares the network. Important
   caveats about the CLI surface here:

   - `codex review` has **no** `--sandbox` / `-s` flag (that flag only exists on
     the global CLI and `codex exec`). For `codex review` you set the mode via a
     config override: `-c sandbox_mode="..."`.
   - The valid modes are `read-only`, `workspace-write`, and
     `danger-full-access`. Only `danger-full-access` actually skips the sandbox;
     `workspace-write` **still** sandboxes (still unshares the network) and so
     still fails on this host.

   So the only invocation that works around the bwrap failure is the one that
   drops the sandbox entirely — use it **only** on a host you trust where the
   diff under review is trusted (e.g. your own branch on a machine you control):

   ```bash
   codex review --uncommitted -c sandbox_mode="danger-full-access"
   ```

   Do **not** do this on a host reviewing an untrusted diff — it removes the
   isolation boundary that review is supposed to run behind. In that case use
   the fallback runner below instead.

## Fallback review runner

If the host genuinely cannot support user + network namespaces (container virt
that blocks netns outright, and you cannot relax AppArmor), do not bypass the
sandbox on the VPS. Run the review on a host that *can* sandbox instead. Any of:

- **A developer laptop / workstation** with namespaces enabled. Clone or fetch
  the branch and run `codex review` there:

  ```bash
  git fetch origin <branch> && git checkout <branch>
  codex review --uncommitted   # or: codex review <base>..<head>
  ```

- **A GitHub Actions runner**, which provides a kernel with full namespace
  support. Trigger review in CI on the PR branch rather than on the VPS.

- **A short-lived cloud VM** (not LXC/OpenVZ) — e.g. a bare KVM instance —
  used only to run the review, then torn down.

The doctor script is safe to commit and run on each candidate host to confirm
the sandbox works there before you rely on it for reviews.
