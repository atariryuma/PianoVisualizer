# gen_cert.ps1 — iOS互換の自己署名証明書を生成
#
# 出力:
#   cert.pfx — サーバ用（秘密鍵入り、パスワード "piano123"）
#   cert.cer — iPad信頼用（公開鍵のみ、DER形式）
#
# 使い方:
#   .\gen_cert.ps1                          # LAN IPを自動検出
#   .\gen_cert.ps1 -IPs 192.168.1.50        # IP明示
#
# iOS要件: SAN必須、SHA-256、RSA 2048+、有効期間 ≤ 825日、Server Auth EKU

param(
    [string[]]$IPs = @(),
    [string]$Password = "piano123",
    [int]$Days = 820
)

$ErrorActionPreference = "Stop"

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

$dnsNames = @("localhost") + $IPs
Write-Host "Subject Alt Names: $($dnsNames -join ', ')" -ForegroundColor Cyan

$certParams = @{
    Subject           = "CN=PianoVisualizer"
    DnsName           = $dnsNames
    KeyAlgorithm      = "RSA"
    KeyLength         = 2048
    HashAlgorithm     = "SHA256"
    NotAfter          = (Get-Date).AddDays($Days)
    KeyUsage          = "DigitalSignature", "KeyEncipherment"
    TextExtension     = @("2.5.29.37={text}1.3.6.1.5.5.7.3.1")   # serverAuth EKU
    CertStoreLocation = "Cert:\CurrentUser\My"
}

Write-Host "Generating certificate..." -ForegroundColor Cyan
$cert = New-SelfSignedCertificate @certParams

$pfxPath = Join-Path $PSScriptRoot "cert.pfx"
$pwdSecure = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwdSecure | Out-Null

$cerPath = Join-Path $PSScriptRoot "cert.cer"
Export-Certificate -Cert $cert -FilePath $cerPath -Type CERT | Out-Null

Remove-Item -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force

Write-Host ""
Write-Host "Created:" -ForegroundColor Green
Write-Host "  $pfxPath   (server, password: $Password)"
Write-Host "  $cerPath   (install on iPad)"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. powershell -File https_server.ps1     # restart server with new cert"
foreach ($ip in $IPs) {
    Write-Host "  2. iPad Safari -> https://${ip}:8443/cert.cer  (warning bypass OK once)"
}
Write-Host "  3. Settings -> General -> VPN & Device Management -> install profile"
Write-Host "  4. Settings -> General -> About -> Certificate Trust Settings -> enable PianoVisualizer"
Write-Host "  5. Web MIDI Browser -> open the same URL, no warning this time"
