#!/usr/bin/env bash
# forge-mcp: uninstall — removes the shell-init marker block from ~/.bashrc
#
# Usage:
#   bash .github/hooks/cairn/uninstall.sh
#
# What it does:
#   Removes the block between MARKER_START and MARKER_END (inclusive) plus
#   the blank line immediately before MARKER_START.
#
# Idempotent: no-op if the marker block is not present.

set -euo pipefail

SHELL_RC="${BASH_RC_PATH:-$HOME/.bashrc}"
MARKER_START="# forge-mcp: shell init — start (managed by install.sh)"
MARKER_END="# forge-mcp: shell init — end"

# Check if installed
if ! grep -qF "$MARKER_START" "$SHELL_RC" 2>/dev/null; then
  echo "forge-mcp shell init is not installed in $SHELL_RC — nothing to do."
  exit 0
fi

# Remove the marker block (sed portable: works on macOS and Linux)
# The pattern removes the blank separator line before MARKER_START,
# MARKER_START itself, everything between, and MARKER_END.
if sed --version &>/dev/null 2>&1; then
  # GNU sed
  sed -i "/^[[:space:]]*$/{N;/\n${MARKER_START//\//\\/}/d}" "$SHELL_RC"
  sed -i "/${MARKER_START//\//\\/}/,/${MARKER_END//\//\\/}/d" "$SHELL_RC"
else
  # BSD sed (macOS)
  sed -i '' "/^[[:space:]]*$/{N;/\n${MARKER_START//\//\\/}/d;}" "$SHELL_RC"
  sed -i '' "/${MARKER_START//\//\\/}/,/${MARKER_END//\//\\/}/d" "$SHELL_RC"
fi

echo "✓ forge-mcp shell init removed from $SHELL_RC"
echo ""
echo "Reload your shell for the change to take effect:"
echo "  source $SHELL_RC"
