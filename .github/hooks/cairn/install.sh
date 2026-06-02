#!/usr/bin/env bash
# forge-mcp: install — idempotent wiring of shell-init.sh into ~/.bashrc
#
# Usage:
#   bash .github/hooks/cairn/install.sh
#
# What it does:
#   1. Locates shell-init.sh (sibling to this script)
#   2. Checks ~/.bashrc for the marker — skips if already installed
#   3. Appends a `source` line guarded by the marker comments
#
# Re-running is safe: the marker check prevents double-registration.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/shell-init.sh"
SHELL_RC="${BASH_RC_PATH:-$HOME/.bashrc}"
MARKER_START="# forge-mcp: shell init — start (managed by install.sh)"
MARKER_END="# forge-mcp: shell init — end"

# Verify the hook script exists
if [[ ! -f "$HOOK_SCRIPT" ]]; then
  echo "ERROR: hook script not found: $HOOK_SCRIPT" >&2
  echo "  Make sure you are running from the repo root or the hooks directory." >&2
  exit 1
fi

# Idempotency check
if grep -qF "$MARKER_START" "$SHELL_RC" 2>/dev/null; then
  echo "forge-mcp shell init is already installed in $SHELL_RC"
  echo ""
  echo "To verify:   source $SHELL_RC && forge_mcp_check"
  echo "To remove:   bash $SCRIPT_DIR/uninstall.sh"
  exit 0
fi

# Append the guarded source block
cat >> "$SHELL_RC" <<EOF

$MARKER_START
if [[ -f "$HOOK_SCRIPT" ]]; then
  # shellcheck source=.github/hooks/cairn/shell-init.sh
  source "$HOOK_SCRIPT"
fi
$MARKER_END
EOF

echo "✓ forge-mcp shell init added to $SHELL_RC"
echo ""
echo "Next steps:"
echo "  1. Reload your shell:   source $SHELL_RC"
echo "  2. Verify the install:  forge_mcp_check"
echo ""
echo "  If forge_mcp_check reports 'NOT FOUND', install the runtime package:"
echo "    npm install -g @akubly/skillsmith-runtime"
echo ""
echo "To remove at any time:  bash $SCRIPT_DIR/uninstall.sh"
