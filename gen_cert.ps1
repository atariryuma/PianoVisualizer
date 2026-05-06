# gen_cert.ps1 — Dev certificate generator (mkcert-backed, 2026-05-07+).
#
# Why mkcert: the previous self-signed-leaf-with-CA:TRUE cert tripped Chrome's
# Service Worker SSL validator (`Failed to register a ServiceWorker ... An SSL
# certificate error occurred when fetching the script`) when accessed over the
# LAN IP — Chrome accepts it for navigation but rejects it for SW registration.
# mkcert produces a proper Root CA + leaf chain, which Chrome accepts in both
# code paths and which iPad/Android can trust *once per device* instead of
# reinstalling on every LAN-IP change.
#
# Output (both gitignored):
#   cert.pfx     — server leaf + key, password from $Password / $env:PIANO_CERT_PASS
#                  (default "piano123" — matches https_server.ps1's default)
#   rootCA.cer   — mkcert root CA in DER (public, fetchable from the dev server
#                  for iPad/Android install — see CLAUDE.md)
#
# The mkcert root *private* key lives in `mkcert -CAROOT`, outside this repo.
# Don't ship it; rootCA.cer is the public half and is safe to distribute.
#
# Usage:
#   .\gen_cert.ps1                       # auto-detect LAN IPs
#   .\gen_cert.ps1 -IPs 192.168.1.50     # override LAN IPs

[Diagnostics.CodeAnalysis.SuppressMessage(
    'PSAvoidUsingPlainTextForPassword',
    'Password',
    Justification = 'Dev-only PFX password (default "piano123"). https_server.ps1 reads the same value as plain text from $env:PIANO_CERT_PASS, so SecureString here would just be re-exposed there. Not a production credential.'
)]
param(
    [string[]]$IPs = @(),
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

# ── 1) mkcert presence check ────────────────────────────────────────────────
$mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
if (-not $mkcert) {
    Write-Host ""
    Write-Host "ERROR: mkcert is not on PATH." -ForegroundColor Red
    Write-Host "Install one of:" -ForegroundColor Yellow
    Write-Host "  scoop install mkcert"
    Write-Host "  choco install mkcert"
    Write-Host "  https://github.com/FiloSottile/mkcert/releases  (download mkcert.exe and add to PATH)"
    Write-Host ""
    Write-Host "Then re-run: powershell -File gen_cert.ps1"
    exit 1
}

# ── 2) Resolve cert password (param > env > default) ───────────────────────
if ([string]::IsNullOrWhiteSpace($Password)) {
    $Password = if ([string]::IsNullOrWhiteSpace($env:PIANO_CERT_PASS)) { "piano123" } else { $env:PIANO_CERT_PASS }
}

# ── 3) LAN IP discovery ────────────────────────────────────────────────────
if ($IPs.Count -eq 0) {
    $detected = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.PrefixOrigin -in @('Manual', 'Dhcp')
    } | Select-Object -ExpandProperty IPAddress

    if ($detected) {
        $IPs = @($detected)
        Write-Host "Detected LAN IPs: $($IPs -join ', ')" -ForegroundColor Cyan
    } else {
        Write-Warning "No LAN IPv4 detected. Cert will only cover localhost."
    }
}

$sanList = @("localhost") + $IPs
Write-Host "Subject Alt Names: $($sanList -join ', ')" -ForegroundColor Cyan

# ── 4) Ensure mkcert root CA exists & is trusted by the OS ─────────────────
# `-install` is idempotent: it returns quickly if the root is already in the
# OS trust stores. On first run it creates the root in `mkcert -CAROOT` and
# may prompt for elevation to add it to the system store.
#
# Why scope to `system,nss`: by default mkcert also tries to install into
# Java's cacerts when it detects a JDK on PATH (e.g. Eclipse Adoptium). The
# cacerts file under `C:\Program Files\...\jdk-*\lib\security\` requires
# admin to write, so a non-elevated `gen_cert.ps1` aborts with
#   `keytool エラー: ... cacerts (アクセスが拒否されました)`
# even though the Windows store install just succeeded. We don't access this
# dev server from any Java process, so scoping to `system` (Windows trust
# store) + `nss` (Firefox/NSS, no admin needed) covers every browser path
# we actually use without requiring elevation.
$env:TRUST_STORES = "system,nss"

Write-Host "Verifying mkcert root CA is installed (TRUST_STORES=$env:TRUST_STORES)..." -ForegroundColor Cyan
& mkcert -install
if ($LASTEXITCODE -ne 0) { throw "mkcert -install failed (exit $LASTEXITCODE)" }

# ── 5) Generate the server leaf cert (PKCS#12) ─────────────────────────────
# mkcert -pkcs12 hardcodes the password to "changeit"; we re-export below so
# https_server.ps1 keeps reading "piano123" / $env:PIANO_CERT_PASS unchanged.
$pfxPath = Join-Path $PSScriptRoot "cert.pfx"
Write-Host "Generating server leaf certificate..." -ForegroundColor Cyan
& mkcert -pkcs12 -p12-file $pfxPath @sanList
if ($LASTEXITCODE -ne 0) { throw "mkcert leaf generation failed (exit $LASTEXITCODE)" }

# ── 6) Re-export the PFX with the project's password ───────────────────────
$tmpCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList @(
    $pfxPath,
    "changeit",
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
)
try {
    $pwdSecure = ConvertTo-SecureString -String $Password -Force -AsPlainText
    $pfxBytes  = $tmpCert.Export(
        [System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx,
        $pwdSecure
    )
    [System.IO.File]::WriteAllBytes($pfxPath, $pfxBytes)
}
finally {
    $tmpCert.Dispose()
}

# ── 7) Copy the mkcert root CA into the repo as rootCA.cer (DER) ───────────
# Served by https_server.ps1 (rootCA.cer is intentionally NOT in $blockedFiles)
# so iPad / Android can fetch it once. The root never changes for the lifetime
# of the dev machine, so subsequent regenerations don't require re-installing
# trust on each device.
$caRoot = (& mkcert -CAROOT).Trim()
if ([string]::IsNullOrWhiteSpace($caRoot) -or -not (Test-Path $caRoot -PathType Container)) {
    throw "Could not resolve 'mkcert -CAROOT' directory: '$caRoot'"
}
$rootCASrc = Join-Path $caRoot "rootCA.pem"
if (-not (Test-Path $rootCASrc -PathType Leaf)) {
    throw "mkcert root cert not found at: $rootCASrc"
}

$rootCADst = Join-Path $PSScriptRoot "rootCA.cer"
$rootCert  = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $rootCASrc
try {
    $rootDer = $rootCert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    [System.IO.File]::WriteAllBytes($rootCADst, $rootDer)
}
finally {
    $rootCert.Dispose()
}

# ── 8) Clean up the legacy self-signed cert.cer if it's left over ──────────
# Pre-mkcert workflow's leaf cert export. No longer needed (Chrome rejects it
# for SW registration anyway). Removing prevents confusion about which cert
# devices should trust.
$legacyLeafCer = Join-Path $PSScriptRoot "cert.cer"
if (Test-Path $legacyLeafCer -PathType Leaf) {
    Remove-Item $legacyLeafCer -Force
    Write-Host "Removed legacy cert.cer (superseded by rootCA.cer)" -ForegroundColor DarkGray
}

# ── 9) Friendly summary ────────────────────────────────────────────────────
Write-Host ""
Write-Host "Created:" -ForegroundColor Green
Write-Host "  $pfxPath        (server, password: $Password)"
Write-Host "  $rootCADst      (iPad / Android trust install — public, safe to share)"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. powershell -File https_server.ps1     # restart server with new cert"
Write-Host "  2. Same PC, any browser: open https://localhost:8443/  (mkcert root already trusted)"
foreach ($ip in $IPs) {
    Write-Host "  3. iPad Safari -> https://${ip}:8443/rootCA.cer    (one-time per iPad)"
}
Write-Host "  4. iPad Settings -> General -> VPN & Device Management -> install profile"
Write-Host "  5. iPad Settings -> General -> About -> Certificate Trust Settings -> enable 'mkcert development CA'"
