param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodeCandidates = @(
        (Join-Path (Get-Location).Path '.runtime\node.exe')
        $(if ($nodeCommand) { $nodeCommand.Source })
        $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'nodejs\node.exe' })
        $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe' })
    )
    $nodePath = $null
    foreach ($candidate in $nodeCandidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            $version = & $candidate --version
            if ($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) {
                $nodePath = $candidate
                break
            }
        }
    }
    if (-not $nodePath) { throw 'Install Node.js 22 or newer from https://nodejs.org, then reopen this launcher.' }
    foreach ($dependency in @('pdfjs-dist', 'tesseract.js')) {
        if (-not (Test-Path -LiteralPath "node_modules\$dependency\package.json")) {
            throw 'Dependencies are missing. Run npm.cmd install in this folder first.'
        }
    }
    if ($CheckOnly) { Write-Host "Ready: $nodePath"; exit 0 }
    Write-Host 'Keep this window open. Press Ctrl+C to stop.'
    & $nodePath --env-file-if-exists=.env src/server.js
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
