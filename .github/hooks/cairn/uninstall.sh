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

# Remove the marker block using a bash line-by-line state machine.
#
# Why not sed? The two-pass approach (blank-line removal first, then range
# delete) has a sequencing bug: the first pass consumes MARKER_START when it
# appears immediately after a blank line, leaving the block body and MARKER_END
# orphaned so the second pass never fires. The bash loop avoids this entirely.
#
# Algorithm:
#   - Buffer blank lines rather than emitting them immediately.
#   - When MARKER_START is seen: discard the buffered blank (the separator
#     install.sh prepended) and enter skip mode.
#   - While skipping: discard all lines until MARKER_END, then exit skip mode.
#   - Non-blank lines outside skip: flush the buffer, emit the line.
_remove_block() {
  local file="$1" start="$2" end="$3"
  local tmpfile
  tmpfile=$(mktemp "${file}.forge-mcp-bak.XXXXXX")
  trap '[[ -n "${tmpfile:-}" ]] && rm -f "$tmpfile"' EXIT INT TERM

  {
    local skip=0 held_blank=0
    while IFS= read -r line || [[ -n "$line" ]]; do
      # Entering the block: drop buffered blank separator, start skipping.
      if [[ $skip -eq 0 && "$line" == "$start" ]]; then
        held_blank=0
        skip=1
        continue
      fi

      # Inside the block: skip every line until MARKER_END (inclusive).
      if [[ $skip -eq 1 ]]; then
        [[ "$line" == "$end" ]] && skip=0
        continue
      fi

      # Outside the block: blank lines are buffered one-deep so we can
      # suppress the separator if the very next line turns out to be MARKER_START.
      if [[ -z "$line" ]]; then
        # Flush any previously held blank before buffering the new one.
        [[ $held_blank -eq 1 ]] && printf '\n'
        held_blank=1
      else
        # Non-blank: flush held blank (it wasn't a separator) then emit.
        [[ $held_blank -eq 1 ]] && printf '\n'
        held_blank=0
        printf '%s\n' "$line"
      fi
    done < "$file"

    # Flush a trailing blank line at EOF if present.
    [[ $held_blank -eq 1 ]] && printf '\n'
  } > "$tmpfile"

  mv "$tmpfile" "$file"
}

_remove_block "$SHELL_RC" "$MARKER_START" "$MARKER_END"

echo "✓ forge-mcp shell init removed from $SHELL_RC"
echo ""
echo "Reload your shell for the change to take effect:"
echo "  source $SHELL_RC"
