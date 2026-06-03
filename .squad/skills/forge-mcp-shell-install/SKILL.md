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

  # 2–3. Global npm — prefer the runtime package, then legacy package fallback.
  if [[ -z "$script" ]] && command -v npm &>/dev/null; then
    local root; root=$(npm root -g 2>/dev/null)
    if [[ -n "$root" ]]; then
      local runtime="$root/@scope/runtime-pkg/dist/hooks/entry.js"
      local legacy="$root/@scope/legacy-pkg/dist/hooks/entry.js"
      [[ -f "$runtime" ]] && script="$runtime"
      [[ -z "$script" && -f "$legacy" ]] && script="$legacy"
    fi
  fi

  # 4–6. Repo checkout — mirror the PowerShell resolver exactly.
  if [[ -z "$script" ]]; then
    local sd; sd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local repo_runtime="$sd/../../../packages/runtime-pkg/dist/hooks/entry.js"
    local repo_legacy="$sd/../../../packages/legacy-pkg/dist/hooks/entry.js"
    local repo_dist="$sd/../../../dist/hooks/entry.js"
    if [[ -f "$repo_runtime" ]]; then
      script="$(cd "$(dirname "$repo_runtime")" && pwd)/$(basename "$repo_runtime")"
    elif [[ -f "$repo_legacy" ]]; then
      script="$(cd "$(dirname "$repo_legacy")" && pwd)/$(basename "$repo_legacy")"
    elif [[ -f "$repo_dist" ]]; then
      script="$(cd "$(dirname "$repo_dist")" && pwd)/$(basename "$repo_dist")"
    fi
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

### 7. Portable uninstall — bash state machine (no sed)

Use a bash line-by-line loop, not sed range-delete. The sed two-pass approach
has a fatal sequencing bug: the blank-line cleanup pass consumes `MARKER_START`
when it appears immediately after a blank line, making the range-delete pass a
no-op and leaving the block body + `MARKER_END` orphaned in the file.

```bash
_remove_block() {
  local file="$1" start="$2" end="$3"
  local tmp="${file}.forge-mcp-bak"

  {
    local skip=0 held_blank=0
    while IFS= read -r line || [[ -n "$line" ]]; do
      # Entering the block: drop buffered blank separator, start skipping.
      if [[ $skip -eq 0 && "$line" == "$start" ]]; then
        held_blank=0; skip=1; continue
      fi
      # Inside the block: skip until MARKER_END (inclusive).
      if [[ $skip -eq 1 ]]; then
        [[ "$line" == "$end" ]] && skip=0; continue
      fi
      # Outside: buffer blank lines one-deep to suppress the separator.
      if [[ -z "$line" ]]; then
        [[ $held_blank -eq 1 ]] && printf '\n'
        held_blank=1
      else
        [[ $held_blank -eq 1 ]] && printf '\n'
        held_blank=0
        printf '%s\n' "$line"
      fi
    done < "$file"
    [[ $held_blank -eq 1 ]] && printf '\n'
  } > "$tmp"

  mv "$tmp" "$file"
}

_remove_block "$SHELL_RC" "$MARKER_START" "$MARKER_END"
```

**Why:** The bash loop is portable across Linux, macOS, and Git Bash on Windows
with no GNU/BSD sed detection required. The byte-identical roundtrip property
(install → uninstall → file unchanged) is the acceptance criterion — verify it
on a sample rc file before shipping any uninstaller.

---

## Examples

**M2 deliverables (forge-mcp bash hooks, 2026-06-01):**
- `.github/hooks/cairn/shell-init.sh` — sourceable hook (patterns 2–6)
- `.github/hooks/cairn/install.sh` — ~/.bashrc wiring (pattern 1)
- `.github/hooks/cairn/uninstall.sh` — clean removal (pattern 7)

---

## Anti-Patterns

- **sed range-delete for marker-block removal** — the two-pass approach (blank-line
  cleanup first, then range delete) has a sequencing bug: when the blank separator
  appears immediately before `MARKER_START`, the first pass consumes `MARKER_START`,
  leaving the block body and `MARKER_END` orphaned so the second pass never fires.
  Each install/uninstall cycle accumulates garbage, and `install.sh` can't detect
  the orphaned tail so it appends a new block on top. Use the bash state-machine
  loop (pattern #7) instead — it passes the byte-identical roundtrip test that
  exposes this bug.
- **Synchronous hook execution** — `node "$script"` without `&` blocks the
  prompt for every new shell. Use detached background execution.
- **Hard-coded single path** — if the package can be installed globally OR from
  a repo checkout, use the multi-path resolution pattern so both work.
- **No non-interactive guard** — sourcing without `[[ $- != *i* ]] && return`
  causes side effects in CI pipelines, git hooks, and subshells that source rc
  files directly.
