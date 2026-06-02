---
name: "forge-mcp-shell-install"
description: "Idempotent ~/.bashrc wiring pattern for shell-init hooks with marker-based guard and multi-path script resolution"
domain: "shell-integration, infra, hooks"
confidence: "high"
source: "earned"
---

## Context

Use this skill when wiring any Node.js hook script into a user's interactive
shell (`~/.bashrc`, `~/.zshrc`). The pattern appeared during M2 (forge-mcp bash
hooks) but is reusable for any install-once, source-on-startup hook.

---

## Patterns

### 1. Marker-block install (idempotent ~/.bashrc wiring)

Never append a raw `source` line without a marker. Use a pair of comments to
fence the managed block — the install script checks for `MARKER_START` before
appending, so re-runs are safe.

```bash
MARKER_START="# tool-name: shell init — start (managed by install.sh)"
MARKER_END="# tool-name: shell init — end"

if grep -qF "$MARKER_START" "$SHELL_RC" 2>/dev/null; then
  echo "already installed"; exit 0
fi

cat >> "$SHELL_RC" <<EOF

$MARKER_START
if [[ -f "$HOOK_SCRIPT" ]]; then
  source "$HOOK_SCRIPT"
fi
$MARKER_END
EOF
```

**Why:** A plain `grep | exit` check would miss a line that got edited; the
marker block is idempotent regardless of surrounding content changes.

### 2. Non-interactive guard (safe in all shell contexts)

Open every sourceable hook script with this guard so CI, subshells, and scripts
never run interactive-only side effects:

```bash
[[ $- != *i* ]] && return
```

### 3. Session-scoped idempotency (env var guard)

Prevent the hook from firing twice if the user sources their rc file in an
already-running interactive session:

```bash
[[ -n "$_MY_HOOK_LOADED" ]] && return
export _MY_HOOK_LOADED=1
```

Name the variable `_<TOOL>_HOOK_LOADED` (underscore prefix = private convention,
`_LOADED` suffix = clear intent).

### 4. Multi-path script resolution (mirrors PowerShell counterpart)

Resolve the Node.js entrypoint in priority order. Always mirror the priority
order of any existing PowerShell equivalent so both platforms behave identically:

```bash
_my_hook_resolve() {
  local script=""
  # 1. User override
  [[ -f "$HOME/.tool/hook/entry.mjs" ]] && script="$HOME/.tool/hook/entry.mjs"
  # 2. Global npm
  if [[ -z "$script" ]] && command -v npm &>/dev/null; then
    local root; root=$(npm root -g 2>/dev/null)
    local c="$root/@scope/pkg/dist/hooks/entry.js"
    [[ -f "$c" ]] && script="$c"
  fi
  # 3. Repo checkout (relative to this script)
  if [[ -z "$script" ]]; then
    local sd; sd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local c="$sd/../../../packages/pkg/dist/hooks/entry.js"
    [[ -f "$c" ]] && script="$(cd "$(dirname "$c")" && pwd)/$(basename "$c")"
  fi
  printf '%s' "$script"
}
```

### 5. Detached background execution (never block shell startup)

```bash
node "$script" &>/dev/null &
disown 2>/dev/null || true
```

`disown` suppresses "background job terminated" messages in bash. The
`|| true` makes it safe in shells that don't support `disown`.

### 6. Smoke-check helper function

Ship a `<tool>_check` function alongside the hook for user verification:

```bash
mytool_check() {
  local script; script="$(_my_hook_resolve)"
  [[ -z "$script" ]] && { echo "NOT FOUND"; return 1; }
  echo "script: $script"
  echo "node: $(node --version 2>/dev/null || echo 'NOT FOUND')"
}
```

This doubles as the documentation for how resolution works — users can call it
after `source ~/.bashrc` to confirm the install is correct.

### 7. Portable uninstall (GNU + BSD sed)

```bash
if sed --version &>/dev/null 2>&1; then
  # GNU sed (Linux)
  sed -i "/${MARKER_START//\//\\/}/,/${MARKER_END//\//\\/}/d" "$SHELL_RC"
else
  # BSD sed (macOS)
  sed -i '' "/${MARKER_START//\//\\/}/,/${MARKER_END//\//\\/}/d" "$SHELL_RC"
fi
```

---

## Examples

**M2 deliverables (forge-mcp bash hooks, 2026-06-01):**
- `.github/hooks/cairn/shell-init.sh` — sourceable hook (patterns 2–6)
- `.github/hooks/cairn/install.sh` — ~/.bashrc wiring (pattern 1)
- `.github/hooks/cairn/uninstall.sh` — clean removal (pattern 7)

---

## Anti-Patterns

- **Bare `source` append without marker** — causes duplicate source lines on
  re-install. Always use a marker block.
- **Synchronous hook execution** — `node "$script"` without `&` blocks the
  prompt for every new shell. Use detached background execution.
- **Hard-coded single path** — if the package can be installed globally OR from
  a repo checkout, use the multi-path resolution pattern so both work.
- **No non-interactive guard** — sourcing without `[[ $- != *i* ]] && return`
  causes side effects in CI pipelines, git hooks, and subshells that source rc
  files directly.
