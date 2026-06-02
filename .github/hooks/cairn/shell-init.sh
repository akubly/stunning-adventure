#!/usr/bin/env bash
# forge-mcp: shell init — fires Cairn session-start hook on bash startup
#
# Source this file from ~/.bashrc (see install.sh for the automated wiring):
#   source /path/to/.github/hooks/cairn/shell-init.sh
#
# Safe to source in non-interactive shells — the guard at the top is a no-op.
# Idempotent — sourcing multiple times in one session fires the hook once only.

# Non-interactive guard: skip silently in scripts, CI, subshells.
[[ $- != *i* ]] && return

# Idempotency guard: only run once per shell session.
[[ -n "$_FORGE_MCP_SHELL_INIT_LOADED" ]] && return
export _FORGE_MCP_SHELL_INIT_LOADED=1

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

  # 3. Repo checkout — relative to this script's location
  if [[ -z "$script" ]]; then
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local repo_candidate="$script_dir/../../../packages/skillsmith-runtime/dist/hooks/sessionStart.js"
    if [[ -f "$repo_candidate" ]]; then
      script="$(cd "$(dirname "$repo_candidate")" && pwd)/$(basename "$repo_candidate")"
    fi
  fi

  printf '%s' "$script"
}

# ---------------------------------------------------------------------------
# Internal: fire the hook silently in the background
# ---------------------------------------------------------------------------
_forge_mcp_run_hook() {
  local script
  script="$(_forge_mcp_resolve_script)"
  [[ -z "$script" ]] && return 0

  # Run detached — must never block shell startup or print to stdout/stderr.
  node "$script" &>/dev/null &
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

  # Report version (from package.json next to dist/)
  local pkg_json
  pkg_json="$(dirname "$(dirname "$script")")/package.json"
  if [[ -f "$pkg_json" ]]; then
    local version
    version=$(node -p "require('$pkg_json').version" 2>/dev/null)
    echo "  package version: ${version:-unknown}"
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
