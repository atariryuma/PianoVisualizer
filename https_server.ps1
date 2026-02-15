Add-Type -AssemblyName System.Net
Add-Type -AssemblyName System.Security

$serverDir = [System.IO.Path]::GetFullPath($PSScriptRoot)
$port = 8443
$certPath = Join-Path $serverDir "cert.pfx"
$certPass = if ([string]::IsNullOrWhiteSpace($env:PIANO_CERT_PASS)) { "piano123" } else { $env:PIANO_CERT_PASS }
$logPath = Join-Path $serverDir "server.log"
$blockedFiles = @("cert.pfx", "https_server.ps1")

function Write-Log([string]$message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $message" | Out-File $logPath -Append -Encoding utf8
}

function Send-Response(
    [System.Net.Security.SslStream]$stream,
    [int]$statusCode,
    [string]$reason,
    [byte[]]$body,
    [string]$contentType
) {
    if (-not $body) { $body = [byte[]]@() }
    if ([string]::IsNullOrWhiteSpace($contentType)) { $contentType = "text/plain; charset=utf-8" }

    $header = "HTTP/1.1 $statusCode $reason`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)

    if ($body.Length -gt 0) {
        $stream.Write($body, 0, $body.Length)
    }
}

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".txt"  = "text/plain; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".ico"  = "image/x-icon"
}

if (-not (Test-Path $certPath -PathType Leaf)) {
    throw "Certificate file not found: $certPath"
}

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath, $certPass)
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
$listener.Start()

"Server started on port $port" | Out-File $logPath -Encoding utf8
Write-Log "Serving files from $serverDir"

$serverRoot = $serverDir
if (-not $serverRoot.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $serverRoot += [System.IO.Path]::DirectorySeparatorChar
}

while ($true) {
    $client = $listener.AcceptTcpClient()
    $client.ReceiveTimeout = 5000
    $client.SendTimeout = 5000

    $sslStream = New-Object System.Net.Security.SslStream($client.GetStream(), $false)
    $reader = $null

    try {
        $sslStream.AuthenticateAsServer($cert, $false, [System.Security.Authentication.SslProtocols]::Tls12, $false)
        $reader = New-Object System.IO.StreamReader(
            $sslStream,
            [System.Text.Encoding]::ASCII,
            $false,
            1024,
            $true
        )

        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($requestLine)) {
            Send-Response -stream $sslStream -statusCode 400 -reason "Bad Request" -body ([System.Text.Encoding]::UTF8.GetBytes("Bad Request")) -contentType "text/plain; charset=utf-8"
            continue
        }

        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
        }

        $parts = $requestLine -split " "
        if ($parts.Length -lt 2) {
            Send-Response -stream $sslStream -statusCode 400 -reason "Bad Request" -body ([System.Text.Encoding]::UTF8.GetBytes("Bad Request")) -contentType "text/plain; charset=utf-8"
            continue
        }

        $method = $parts[0].ToUpperInvariant()
        if ($method -ne "GET") {
            Send-Response -stream $sslStream -statusCode 405 -reason "Method Not Allowed" -body ([System.Text.Encoding]::UTF8.GetBytes("Method Not Allowed")) -contentType "text/plain; charset=utf-8"
            continue
        }

        $rawTarget = $parts[1]
        $requestPath = ($rawTarget -split "\?")[0]
        if ($requestPath -eq "/" -or [string]::IsNullOrWhiteSpace($requestPath)) {
            $requestPath = "/piano-visualizer.html"
        }

        $decodedPath = [System.Uri]::UnescapeDataString($requestPath)
        $relativePath = $decodedPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            $relativePath = "piano-visualizer.html"
        }

        $candidatePath = [System.IO.Path]::GetFullPath((Join-Path $serverDir $relativePath))
        $fileName = [System.IO.Path]::GetFileName($candidatePath).ToLowerInvariant()

        if (-not $candidatePath.StartsWith($serverRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            Send-Response -stream $sslStream -statusCode 403 -reason "Forbidden" -body ([System.Text.Encoding]::UTF8.GetBytes("Forbidden")) -contentType "text/plain; charset=utf-8"
            continue
        }
        if ($blockedFiles -contains $fileName) {
            Send-Response -stream $sslStream -statusCode 403 -reason "Forbidden" -body ([System.Text.Encoding]::UTF8.GetBytes("Forbidden")) -contentType "text/plain; charset=utf-8"
            continue
        }
        if (-not (Test-Path $candidatePath -PathType Leaf)) {
            Send-Response -stream $sslStream -statusCode 404 -reason "Not Found" -body ([System.Text.Encoding]::UTF8.GetBytes("Not Found")) -contentType "text/plain; charset=utf-8"
            continue
        }

        $content = [System.IO.File]::ReadAllBytes($candidatePath)
        $ext = [System.IO.Path]::GetExtension($candidatePath).ToLowerInvariant()
        $contentType = $mimeMap[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }

        Send-Response -stream $sslStream -statusCode 200 -reason "OK" -body $content -contentType $contentType
    } catch {
        Write-Log $_.Exception.Message
    } finally {
        if ($reader) { $reader.Close() }
        $sslStream.Close()
        $client.Close()
    }
}
