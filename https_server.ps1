Add-Type -AssemblyName System.Net
Add-Type -AssemblyName System.Security

$serverDir = "$env:USERPROFILE\Documents\PianoVisualizer"
$port = 8443
$certPath = "$serverDir\cert.pfx"
$certPass = "piano123"

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath, $certPass)
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
$listener.Start()

"Server started on port $port" | Out-File "$serverDir\server.log"

while ($true) {
    $client = $listener.AcceptTcpClient()
    $sslStream = New-Object System.Net.Security.SslStream($client.GetStream(), $false)
    try {
        $sslStream.AuthenticateAsServer($cert, $false, [System.Security.Authentication.SslProtocols]::Tls12, $false)
        
        $reader = New-Object System.IO.StreamReader($sslStream)
        $requestLine = $reader.ReadLine()
        # Read headers
        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
        }
        
        $path = ($requestLine -split ' ')[1]
        if ($path -eq '/' -or $path -eq '') { $path = '/piano-visualizer.html' }
        $filePath = Join-Path $serverDir ($path.TrimStart('/'))
        
        if (Test-Path $filePath) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $header = "HTTP/1.1 200 OK`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($content.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $sslStream.Write($headerBytes, 0, $headerBytes.Length)
            $sslStream.Write($content, 0, $content.Length)
        } else {
            $header = "HTTP/1.1 404 Not Found`r`nConnection: close`r`n`r`nNot Found"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $sslStream.Write($headerBytes, 0, $headerBytes.Length)
        }
        $sslStream.Flush()
    } catch {
        $_.Exception.Message | Out-File "$serverDir\server.log" -Append
    } finally {
        $sslStream.Close()
        $client.Close()
    }
}
