#!/usr/bin/env bash
# forge-mcp: shell init — fires Cairn session-start hook on bash startup
#
# Source this file from ~/.bashrc (see install.sh for the automated wiring):
#   source /path/to/.github/hooks/cairn/shell-init.sh
#
# Safe to source in non-interactive shells — the guard at the top is a no-op.
# Idempotent — sourcing multiple times in one session fires the hook once only.

# Must be sourced, not executed.
(return 0 2>/dev/null) || { echo "shell-init.sh must be sourced, not executed: source ${BASH_SOURCE[0]}" >&2; exit 1; }

# Non-interactive guard: skip silently in scripts, CI, subshells.
[[ $- != *i* ]] && return

# Idempotency guard: only run once per shell session.
[[ -n "$_FORGE_MCP_SHELL_INIT_LOADED" ]] && return
_FORGE_MCP_SHELL_INIT_LOADED=1

# ---------------------------------------------------------------------------
# Internal: resolve the sessionStart script path (mirrors curate.ps1 logic)
# ---------------------------------------------------------------------------
_forge_mcp_resolve_script() {
  local script=""

  # 1. User-deployed override
  if [[ -f "$HOME/.cairn/hook/sessionStart.mjs" ]]; then
    script="$HOME/.cairn/hook/sessionStart.mjs"
  fi

  # 2. Global npm install — prefer skillsmith-runtime, fall back to cairn
  if [[ -z "$script" ]] && command -v npm &>/dev/null; then
    local npm_root
    npm_root=$(npm root -g 2>/dev/null)
    if [[ -n "$npm_root" ]]; then
      local rt_candidate="$npm_root/@akubly/skillsmith-runtime/dist/hooks/sessionStart.js"
      local cairn_candidate="$npm_root/@akubly/cairn/dist/hooks/sessionStart.js"
      if [[ -f "$rt_candidate" ]]; then
        script="$rt_candidate"
      elif [[ -f "$cairn_candidate" ]]; then
        script="$cairn_candidate"
      fi
    fi
  fi

  # 3. Repo checkout — relative to this script's location.
  # Keep this fallback chain in parity with curate.ps1:
  # skillsmith-runtime first, then cairn package, then legacy repo-level dist.
  if [[ -z "$script" ]]; then
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local repo_runtime_candidate="$script_dir/../../../packages/skillsmith-runtime/dist/hooks/sessionStart.js"
    local repo_cairn_candidate="$script_dir/../../../packages/cairn/dist/hooks/sessionStart.js"
    local repo_legacy_cairn_candidate="$script_dir/../../../dist/hooks/sessionStart.js"

    if [[ -f "$repo_runtime_candidate" ]]; then
      script="$(cd "$(dirname "$repo_runtime_candidate")" && pwd)/$(basename "$repo_runtime_candidate")"
    elif [[ -f "$repo_cairn_candidate" ]]; then
      script="$(cd "$(dirname "$repo_cairn_candidate")" && pwd)/$(basename "$repo_cairn_candidate")"
    elif [[ -f "$repo_legacy_cairn_candidate" ]]; then
      script="$(cd "$(dirname "$repo_legacy_cairn_candidate")" && pwd)/$(basename "$repo_legacy_cairn_candidate")"
    fi
  fi

  printf '%s' "$script"
}

# ---------------------------------------------------------------------------
# Internal: fire the hook silently in the background
# ---------------------------------------------------------------------------
_forge_mcp_run_hook() {
  # Both resolution (which calls `npm root -g`, 150ms–1s+) and execution are
  # moved into the background subshell so nothing blocks shell startup.
  # The subshell inherits _forge_mcp_resolve_script from the parent process.
  (
    local script
    script="$(_forge_mcp_resolve_script)"
    [[ -z "$script" ]] && exit 0
    # sessionStart.js reads stdin to EOF before processing; pipe a finite JSON
    # payload matching its HookInput schema so Node does not block on the TTY.
    local payload_cwd="$PWD"
    if command -v cygpath &>/dev/null; then
      payload_cwd="$(cygpath -w "$payload_cwd" 2>/dev/null || printf '%s' "$payload_cwd")"
    fi
    node -e 'process.stdout.write(JSON.stringify({ toolName: "shellInit", cwd: process.argv[1] }) + "\n")' "$payload_cwd" | node "$script"
  ) &>/dev/null &
  disown 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Public: smoke-check helper (run manually to verify install)
#   Usage: forge_mcp_check
# ---------------------------------------------------------------------------
forge_mcp_check() {
  echo "forge-mcp shell init: checking install..."

  # Report env guard
  echo "  _FORGE_MCP_SHELL_INIT_LOADED = ${_FORGE_MCP_SHELL_INIT_LOADED:-<not set>}"

  # Resolve script
  local script
  script="$(_forge_mcp_resolve_script)"
  if [[ -z "$script" ]]; then
    echo "  sessionStart script: NOT FOUND"
    echo ""
    echo "  To fix: install @akubly/skillsmith-runtime globally:"
    echo "    npm install -g @akubly/skillsmith-runtime"
    return 1
  fi
  echo "  sessionStart script: $script"

  # Report version (from package.json two levels above dist/hooks/)
  # $script = .../skillsmith-runtime/dist/hooks/sessionStart.js
  # dirname x1 → dist/hooks, dirname x2 → dist, dirname x3 → skillsmith-runtime
  local pkg_json
  pkg_json="$(dirname "$(dirname "$(dirname "$script")")")/package.json"
  if [[ -f "$pkg_json" ]]; then
    local version node_pkg_json
    node_pkg_json="$pkg_json"
    if command -v cygpath &>/dev/null; then
      node_pkg_json="$(cygpath -w "$pkg_json" 2>/dev/null || printf '%s' "$pkg_json")"
    fi
    # Pass the path via argv to avoid quoting/escaping issues with MSYS2 paths.
    version=$(node -p "require(process.argv[1]).version" "$node_pkg_json" 2>/dev/null)
    echo "  package version: ${version:-unknown}"
  fi

  if [[ "$script" != "$HOME/.cairn/hook/sessionStart.mjs" && "$script" != *"/skillsmith-runtime/"* ]]; then
    echo "  warning: using cairn fallback (Wave 2 behavior, no prescribers)"
  fi

  # Check node availability
  if command -v node &>/dev/null; then
    echo "  node: $(node --version)"
  else
    echo "  node: NOT FOUND — install Node.js to use forge-mcp hooks"
    return 1
  fi

  echo ""
  echo "  ✓ forge-mcp shell init is correctly installed."
  return 0
}

# ---------------------------------------------------------------------------
# Fire the hook on this session start
# ---------------------------------------------------------------------------
_forge_mcp_run_hook
