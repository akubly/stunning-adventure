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

    $usingCairnFallback = $false

    # 2. Global npm install — prefer skillsmith-runtime (Wave 3 composition root)
    if (-not $script) {
        $root = & npm root -g 2>$null
        if ($root) {
            $runtimeCandidate = Join-Path $root '@akubly\skillsmith-runtime\dist\hooks\sessionStart.js'
            if (Test-Path $runtimeCandidate) {
                $script = $runtimeCandidate
            } else {
                $cairnCandidate = Join-Path $root '@akubly\cairn\dist\hooks\sessionStart.js'
                if (Test-Path $cairnCandidate) {
                    $script = $cairnCandidate
                    $usingCairnFallback = $true
                }
            }
        }
    }

    # 3. Repo checkout (this script lives at .github/hooks/cairn/) — prefer skillsmith-runtime
    if (-not $script) {
        $runtimeCandidates = @(
            (Join-Path $PSScriptRoot '..\..\..\packages\skillsmith-runtime\dist\hooks\sessionStart.js')
        )
        foreach ($candidate in $runtimeCandidates) {
            if (Test-Path $candidate) {
                $script = $candidate
                break
            }
        }
    }

    # 4. Repo checkout cairn fallback (Wave 2 behavior, no prescribers)
    if (-not $script) {
        $cairnCandidates = @(
            (Join-Path $PSScriptRoot '..\..\..\packages\cairn\dist\hooks\sessionStart.js'),
            "$PSScriptRoot\..\..\..\dist\hooks\sessionStart.js"
        )
        foreach ($candidate in $cairnCandidates) {
            if (Test-Path $candidate) {
                $script = $candidate
                $usingCairnFallback = $true
                break
            }
        }
    }

    if (-not $script) { exit 0 }

    if ($usingCairnFallback) {
        Write-Warning "skillsmith-runtime hook entry not configured; using cairn hook (Wave 2 behavior, no prescribers)"
    }

    $hookData | node $script
} catch {
    # Fail open — hooks must never break the user's workflow
}

exit 0
