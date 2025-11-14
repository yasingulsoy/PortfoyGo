# Kill processes using port 5000
$port = 5000
$processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($processes) {
    Write-Host "Found processes using port 5000: $($processes -join ', ')" -ForegroundColor Yellow
    foreach ($pid in $processes) {
        try {
            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "Killing process: $($process.ProcessName) (PID: $pid)" -ForegroundColor Red
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Host "Process killed: PID $pid" -ForegroundColor Green
            }
        } catch {
            Write-Host "Could not kill process: PID $pid - $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    Start-Sleep -Seconds 1
    Write-Host "Port 5000 is now free. Backend can be started." -ForegroundColor Green
} else {
    Write-Host "Port 5000 is not in use." -ForegroundColor Green
}
