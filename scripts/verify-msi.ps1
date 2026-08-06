<#
.SYNOPSIS
    Installs the MSI, asserts what it put on disk, launches it, and removes it.

.DESCRIPTION
    `release.yml` and `windows-msi-dev.yml` both call this, so the dev harness
    asserts exactly what the release asserts.

    The tree comparison is the point. Asserting Stuffbucket.exe alone passes on
    an installer that carries the executable and none of the asar, the locales
    or the resources it needs.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $Msi,
    [string] $Manifest,
    [string] $InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\Stuffbucket'),
    [int] $MinimumFiles = 50,
    [switch] $NoLaunch
)

$ErrorActionPreference = 'Stop'

$msiPath = (Resolve-Path -LiteralPath $Msi).Path
if (-not $Manifest) { $Manifest = "${msiPath}.files.txt" }

# A truncated manifest would make the comparison below pass on nothing, which
# is the shape every false pass in this repository has had.
$expected = @(Get-Content -LiteralPath $Manifest | Where-Object { $_ -ne '' })
if ($expected.Count -lt $MinimumFiles) {
    throw "Manifest lists $($expected.Count) files, fewer than $MinimumFiles."
}
foreach ($required in 'Stuffbucket.exe', 'resources\app.asar') {
    if (-not ($expected | Where-Object { $_.StartsWith("$required|") })) {
        throw "Manifest does not name $required, so comparing against it proves nothing."
    }
}

$log = 'install.log'
$install = Start-Process msiexec -ArgumentList '/i', "`"$msiPath`"", '/qn', '/l*v', $log -Wait -PassThru
if ($install.ExitCode -ne 0) {
    Get-Content -LiteralPath $log -Tail 60
    throw "Install failed with exit code $($install.ExitCode)"
}

$actual = @(
    Get-ChildItem -LiteralPath $InstallDir -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        '{0}|{1}' -f $_.FullName.Substring($InstallDir.Length + 1), $_.Length
    }
) | Sort-Object

$difference = Compare-Object -ReferenceObject $expected -DifferenceObject $actual
$missing = @($difference | Where-Object { $_.SideIndicator -eq '<=' } | ForEach-Object { $_.InputObject })
$extra = @($difference | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { $_.InputObject })

if ($extra.Count -gt 0) {
    Write-Host "Installed but not in the packaged app: $($extra -join ', ')"
}
if ($missing.Count -gt 0) {
    $sample = ($missing | Select-Object -First 25) -join "`n  "
    throw "$($missing.Count) of $($expected.Count) files are missing from ${InstallDir}:`n  $sample"
}
Write-Host "All $($expected.Count) packaged files are installed in $InstallDir"

$marker = Get-ItemProperty -Path 'HKCU:\Software\stuffbucket\Stuffbucket' -Name installed
if ($marker.installed -ne 1) { throw 'HKCU installed marker not set' }

$arp = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' |
    ForEach-Object { Get-ItemProperty $_.PSPath } |
    Where-Object { $_.DisplayName -eq 'Stuffbucket' }
if (-not $arp) { throw 'No Add/Remove Programs entry' }

# A complete tree still does not prove the application starts. Electron exits
# within a second or two when the asar is unreadable or a native module is the
# wrong architecture, and nothing above would notice.
if (-not $NoLaunch) {
    $launched = Start-Process -FilePath (Join-Path $InstallDir 'Stuffbucket.exe') -PassThru
    Start-Sleep -Seconds 20
    $launched.Refresh()
    if ($launched.HasExited) {
        throw "Stuffbucket.exe exited within 20 seconds, with code $($launched.ExitCode)"
    }
    Write-Host "Stuffbucket.exe was still running after 20 seconds"

    # /T, because Electron's GPU and renderer children outlive their parent.
    & taskkill.exe /F /IM Stuffbucket.exe /T | Out-Null
    Start-Sleep -Seconds 5
}

$uninstall = Start-Process msiexec -ArgumentList '/x', "`"$msiPath`"", '/qn' -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw "Uninstall failed with exit code $($uninstall.ExitCode)" }

if (Test-Path -LiteralPath (Join-Path $InstallDir 'Stuffbucket.exe')) {
    throw "Files left behind in $InstallDir"
}
Write-Host 'Installed, launched and removed cleanly'
