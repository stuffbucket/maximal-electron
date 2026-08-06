<#
.SYNOPSIS
    Builds the Windows MSI, and writes the manifest verify-msi.ps1 checks against.

.DESCRIPTION
    `release.yml` and `windows-msi-dev.yml` both call this. One copy of the
    `wix build` command line, because the release workflow and the dev harness
    drifting apart is how a harness verifies something the release does not.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $Version,
    [Parameter(Mandatory = $true)][string] $Out,
    [string] $AppDir = 'out\Stuffbucket-win32-x64',
    [int] $MinimumFiles = 50
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath (Join-Path $AppDir 'Stuffbucket.exe'))) {
    throw "Packaged app not found at $AppDir"
}

# WiX resolves a relative bind path inside Files/@Include against the .wxs
# file's own directory, not the working directory, then warns and harvests
# nothing. That shipped an MSI with no application in it (#86).
$appRoot = (Resolve-Path -LiteralPath $AppDir).Path

$outDir = Split-Path -Parent $Out
if ($outDir) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

# WIX8600 is zero files harvested and WIX8601 is a missing harvest directory.
# Both are warnings, and an MSI that harvested nothing still builds, installs
# and registers itself.
wix build build\windows\app.wxs `
    -d "Version=$Version" `
    -arch x64 `
    -bindpath "AppDir=$appRoot" `
    -ext WixToolset.Util.wixext `
    -wx8600 `
    -wx8601 `
    -out $Out
if ($LASTEXITCODE -ne 0) { throw "wix build failed with exit code $LASTEXITCODE" }

# Every file the harvest should have picked up, with its size. The verify job
# compares the installed tree against this, so a partial harvest fails as
# loudly as an empty one.
$manifest = @(
    Get-ChildItem -LiteralPath $appRoot -Recurse -File | ForEach-Object {
        '{0}|{1}' -f $_.FullName.Substring($appRoot.Length + 1), $_.Length
    }
) | Sort-Object

if ($manifest.Count -lt $MinimumFiles) {
    throw "Manifest lists $($manifest.Count) files, fewer than $MinimumFiles. A packaged Electron app is hundreds."
}

$manifestPath = "${Out}.files.txt"
Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding utf8

Write-Host "Built $Out"
Write-Host "$($manifest.Count) files listed in $manifestPath"
