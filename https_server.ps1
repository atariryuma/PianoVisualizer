param(
    # Directory to serve. Defaults to packages/web/dist (the Vite build
    # output, Phase 0b.3 onwards). Override with -Root anywhere else for
    # ad-hoc serving. The cert lookup still happens from $PSScriptRoot
    # so cert.pfx doesn't have to live inside the served directory.
    [string]$Root = (Join-Path $PSScriptRoot "packages\web\dist"),
    [int]$Port = 8443,
    # Concurrent worker cap. The single-threaded version (pre-2026-05-07)
    # made Workbox's importScripts() race the page's chunk fetches during
    # a cold load — Chrome would then report `Failed to register a
    # ServiceWorker ... An unknown error occurred when fetching the
    # script` because the SW thread's `workbox-*.js` request stalled
    # behind the HTML/JS/MXL fan-out and tripped the 5s socket timeout.
    # 16 covers Chrome's typical concurrent-request burst on a cold load
    # while keeping memory bounded.
    [int]$MaxConcurrent = 16
)

Add-Type -AssemblyName System.Net
Add-Type -AssemblyName System.Security

$scriptDir = [System.IO.Path]::GetFullPath($PSScriptRoot)
$serverDir = [System.IO.Path]::GetFullPath($Root)
$certPath = Join-Path $scriptDir "cert.pfx"
$certPass = if ([string]::IsNullOrWhiteSpace($env:PIANO_CERT_PASS)) { "piano123" } else { $env:PIANO_CERT_PASS }
$logPath = Join-Path $scriptDir "server.log"

# Block server-only files from being served to LAN clients:
#   - cert.pfx          : server leaf cert + private key (signed by mkcert root)
#   - https_server.ps1  : exposing the server source itself adds nothing
#   - gen_cert.ps1      : leaks the default cert password literal "piano123"
#   - server.log        : contains every client's UA + every /log POST body
#                         (debug dumps that may include score data, device info)
#
# Intentionally NOT blocked:
#   - rootCA.cer        : public mkcert root CA (DER). Needs to be downloadable
#                         so iPad / Android / Web MIDI Browser can install
#                         trust once. See CLAUDE.md "iPad / strict-cert
#                         browser setup". The root *private* key never lands
#                         here — it stays in `mkcert -CAROOT`, outside the repo.
$blockedFiles = @("cert.pfx", "https_server.ps1", "gen_cert.ps1", "server.log")

# Per-client handler. Runs inside a runspace from $pool below. Helpers and the
# MIME map are inlined so we don't have to plumb functions through
# InitialSessionState — the per-call cost is in the microseconds compared to
# the TLS handshake we're about to do.
$clientHandler = {
    param(
        [System.Net.Sockets.TcpClient]$client,
        [string]$certPath,
        [string]$certPass,
        [string]$serverDir,
        [string[]]$blockedFiles,
        [string]$logPath
    )

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
        ".cer"  = "application/pkix-cert"
        ".crt"  = "application/pkix-cert"
    }

    function Write-Log([string]$message) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        # Best-effort: concurrent appends from sibling workers can occasionally
        # collide on the file lock. We swallow the exception rather than fail
        # the request — the log is debug-only.
        try {
            "$timestamp $message" | Out-File $logPath -Append -Encoding utf8
        } catch { }
    }

    # UA-based client tag for /log entries. Previously hardcoded as "iPad" which
    # misled when other devices (Steam Deck, desktop browsers) hit the same endpoint.
    function Get-ClientTag([hashtable]$hdrs) {
        $ua = $hdrs["User-Agent"]
        if (-not $ua) { return "Unknown" }
        if ($ua -match "iPad")             { return "iPad" }
        if ($ua -match "iPhone")           { return "iPhone" }
        if ($ua -match "Android")          { return "Android" }
        if ($ua -match "Macintosh|Mac OS X") { return "Mac" }
        if ($ua -match "Linux")            { return "Linux" }
        if ($ua -match "Windows")          { return "Windows" }
        return "Web"
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

    $serverRoot = $serverDir
    if (-not $serverRoot.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $serverRoot += [System.IO.Path]::DirectorySeparatorChar
    }

    $client.ReceiveTimeout = 5000
    $client.SendTimeout = 5000

    $sslStream = New-Object System.Net.Security.SslStream($client.GetStream(), $false)
    $reader = $null
    $cert = $null

    try {
        $certFlags =
            [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::MachineKeySet -bor
            [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet -bor
            [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
        $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certPath, $certPass, $certFlags)
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
            return
        }

        # v10: Parse headers
        $headers = @{}
        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
            $parts = $line -split ":", 2
            if ($parts.Length -ge 2) {
                $headers[$parts[0].Trim()] = $parts[1].Trim()
            }
        }

        $parts = $requestLine -split " "
        if ($parts.Length -lt 2) {
            Send-Response -stream $sslStream -statusCode 400 -reason "Bad Request" -body ([System.Text.Encoding]::UTF8.GetBytes("Bad Request")) -contentType "text/plain; charset=utf-8"
            return
        }

        $method = $parts[0].ToUpperInvariant()
        $rawTarget = $parts[1]
        $requestPath = ($rawTarget -split "\?")[0]

        # v10: Handle POST /log
        if ($method -eq "POST" -and $requestPath -eq "/log") {
            $length = 0
            if ($headers.ContainsKey("Content-Length")) {
                $length = [int]$headers["Content-Length"]
            }
            if ($length -gt 0) {
                $buffer = New-Object char[] $length
                $reader.Read($buffer, 0, $length) | Out-Null
                # Fix: Use [string]::new constructor to avoid array unrolling issues
                $bodyStr = [string]::new($buffer)
                $now = Get-Date -Format "HH:mm:ss"
                $clientTag = Get-ClientTag $headers
                Write-Host "[$now $clientTag Log] $bodyStr" -ForegroundColor Cyan
                Write-Log "[$clientTag] $bodyStr"
            }
            Send-Response -stream $sslStream -statusCode 200 -reason "OK" -body ([System.Text.Encoding]::UTF8.GetBytes("Logged")) -contentType "text/plain; charset=utf-8"
            return
        }

        if ($method -ne "GET") {
            Send-Response -stream $sslStream -statusCode 405 -reason "Method Not Allowed" -body ([System.Text.Encoding]::UTF8.GetBytes("Method Not Allowed")) -contentType "text/plain; charset=utf-8"
            return
        }

        # Default to index.html (the canonical entry as of 2026-05-05).
        if ($requestPath -eq "/" -or [string]::IsNullOrWhiteSpace($requestPath)) {
            $requestPath = "/index.html"
        }

        $decodedPath = [System.Uri]::UnescapeDataString($requestPath)
        $relativePath = $decodedPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            $relativePath = "index.html"
        }

        $candidatePath = [System.IO.Path]::GetFullPath((Join-Path $serverDir $relativePath))
        $fileName = [System.IO.Path]::GetFileName($candidatePath).ToLowerInvariant()

        if (-not $candidatePath.StartsWith($serverRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            Send-Response -stream $sslStream -statusCode 403 -reason "Forbidden" -body ([System.Text.Encoding]::UTF8.GetBytes("Forbidden")) -contentType "text/plain; charset=utf-8"
            return
        }
        if ($blockedFiles -contains $fileName) {
            Send-Response -stream $sslStream -statusCode 403 -reason "Forbidden" -body ([System.Text.Encoding]::UTF8.GetBytes("Forbidden")) -contentType "text/plain; charset=utf-8"
            return
        }
        if (-not (Test-Path $candidatePath -PathType Leaf)) {
            Send-Response -stream $sslStream -statusCode 404 -reason "Not Found" -body ([System.Text.Encoding]::UTF8.GetBytes("Not Found")) -contentType "text/plain; charset=utf-8"
            return
        }

        $content = [System.IO.File]::ReadAllBytes($candidatePath)
        $ext = [System.IO.Path]::GetExtension($candidatePath).ToLowerInvariant()
        $contentType = $mimeMap[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }

        Send-Response -stream $sslStream -statusCode 200 -reason "OK" -body $content -contentType $contentType
    }
    catch {
        # Don't crash the worker — log and let `finally` close the streams.
        $msg = $_.Exception.Message
        $inner = $_.Exception.InnerException
        while ($inner) {
            $msg += " Inner: $($inner.Message)"
            $inner = $inner.InnerException
        }
        Write-Log "Worker error: $msg"
    }
    finally {
        if ($reader)    { try { $reader.Close()    } catch { } }
        if ($sslStream) { try { $sslStream.Close() } catch { } }
        if ($client)    { try { $client.Close()    } catch { } }
        if ($cert)      { try { $cert.Dispose()    } catch { } }
    }
}

if (-not (Test-Path $certPath -PathType Leaf)) {
    throw "Certificate file not found: $certPath"
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)

# Bind+listen separately so a port-in-use failure is fatal with a useful hint
# instead of silently dropping into the accept loop and re-throwing on every
# `AcceptTcpClient` call. (Pre-2026-05-07 we relied on $ErrorActionPreference
# default which let the script march past Start() and confusingly print the
# green "listening" line right after the SocketException.)
try {
    $listener.Start()
}
catch {
    Write-Host "ERROR: cannot bind to port ${Port}: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Hint: another https_server.ps1 instance is probably still listening." -ForegroundColor Yellow
    Write-Host "  Get-NetTCPConnection -LocalPort $Port -State Listen | ForEach-Object { Get-Process -Id `$_.OwningProcess }" -ForegroundColor Yellow
    Write-Host "  Get-NetTCPConnection -LocalPort $Port -State Listen | ForEach-Object { Stop-Process -Id `$_.OwningProcess -Force }" -ForegroundColor Yellow
    exit 1
}

"Server started on port $Port" | Out-File $logPath -Encoding utf8
"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Serving files from $serverDir (max $MaxConcurrent concurrent)" | Out-File $logPath -Append -Encoding utf8
Write-Host "HTTPS server listening on port $Port (root: $serverDir, max concurrent: $MaxConcurrent)" -ForegroundColor Green

# Each accepted client gets dispatched to its own runspace so Workbox's
# importScripts() (and the page's parallel chunk fan-out) can complete
# without queueing behind another client's response. Min=1 keeps cold-start
# cheap; Max=$MaxConcurrent caps memory under flood.
$pool = [RunspaceFactory]::CreateRunspacePool(1, $MaxConcurrent, $Host)
$pool.Open()

# In-flight worker handles. We sweep this list every accept so completed
# runspaces are released back to the pool and don't leak. AddScript wants a
# string, so the scriptblock is converted once here.
$handlerText = $clientHandler.ToString()
$jobs = [System.Collections.ArrayList]::new()

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()

        $ps = [PowerShell]::Create()
        $ps.RunspacePool = $pool
        [void]$ps.AddScript($handlerText).
            AddArgument($client).
            AddArgument($certPath).
            AddArgument($certPass).
            AddArgument($serverDir).
            AddArgument($blockedFiles).
            AddArgument($logPath)
        $async = $ps.BeginInvoke()
        [void]$jobs.Add([pscustomobject]@{ PS = $ps; Async = $async })

        for ($i = $jobs.Count - 1; $i -ge 0; $i--) {
            if ($jobs[$i].Async.IsCompleted) {
                try { $jobs[$i].PS.EndInvoke($jobs[$i].Async) | Out-Null } catch { }
                $jobs[$i].PS.Dispose()
                $jobs.RemoveAt($i)
            }
        }
    }
}
finally {
    foreach ($j in $jobs) {
        try { $j.PS.Stop() } catch { }
        try { $j.PS.Dispose() } catch { }
    }
    try { $pool.Close(); $pool.Dispose() } catch { }
    try { $listener.Stop() } catch { }
}
