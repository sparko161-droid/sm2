# Local web server startup script for sm2 project

# Get script parent directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "=== Starting Web Server for sm2 project ===" -ForegroundColor Cyan
Write-Host "Working directory: $scriptPath" -ForegroundColor Gray
Write-Host ""

# Get local IP address (IPv4)
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress

if (-not $localIP) {
    $localIP = "127.0.0.1"
}

Write-Host "Local IP address: $localIP" -ForegroundColor Yellow
Write-Host ""
Write-Host "Server will be available at:" -ForegroundColor Green
Write-Host "  http://localhost:8080" -ForegroundColor White
Write-Host "  http://127.0.0.1:8080" -ForegroundColor White

if ($localIP -ne "127.0.0.1") {
    Write-Host "  http://$localIP`:8080" -ForegroundColor White
    Write-Host ""
    Write-Host "For access from other devices in the network:" -ForegroundColor Cyan
    Write-Host "  http://$localIP`:8080" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Red
Write-Host ""
Write-Host "Launching server..." -ForegroundColor Green
Write-Host ""

# Run http-server
# -p 8080 - port
# -a 0.0.0.0 - listen on all interfaces
# --cors - enable CORS
# -c-1 - disable caching
http-server -p 8080 -a 0.0.0.0 --cors -c-1
