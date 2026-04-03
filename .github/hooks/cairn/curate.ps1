# Cairn Curator — preToolUse hook wrapper
# Crash recovery + pattern detection
# Fail-open: any error exits silently with code 0

$ErrorActionPreference = 'SilentlyContinue'

try {
    $hookData = [System.IO.StreamReader]::new([Console]::OpenStandardInput()).ReadToEnd()
    if (-not $hookData -or $hookData.Trim().Length -eq 0) { exit 0 }

    $script = $null

    # 1. User-deployed override
    $p = Join-Path $HOME '.cairn\hook\sessionStart.mjs'
    if (Test-Path $p) { $script = $p }

    # 2. Global npm install
    if (-not $script) {
        $root = & npm root -g 2>$null
        if ($root) {
            $p = Join-Path $root '@akubly\cairn\dist\hooks\sessionStart.js'
            if (Test-Path $p) { $script = $p }
        }
    }

    # 3. Repo checkout (this script lives at .github/hooks/cairn/)
    if (-not $script) {
        $p = "$PSScriptRoot\..\..\..\dist\hooks\sessionStart.js"
        if (Test-Path $p) { $script = $p }
    }

    if (-not $script) { exit 0 }

    $hookData | node $script 2>$null
} catch {
    # Fail open — hooks must never break the user's workflow
}

exit 0
