param(
    [string]$ComPort = "COM5"
)

Write-Host "Connecting to Pavo Femto on $ComPort..."
$port = new-Object System.IO.Ports.SerialPort $ComPort,115200,None,8,one

try {
    $port.Open()
    # Send a hash to enter CLI and wake it up
    $port.WriteLine("#")
    Start-Sleep -Milliseconds 500
    $initialOutput = $port.ReadExisting()
    if ($initialOutput) {
        Write-Host $initialOutput
    }

    while ($true) {
        $cmd = Read-Host "betaflight> "
        if ($cmd -eq "exit") {
            $port.WriteLine("exit")
            Start-Sleep -Milliseconds 500
            Write-Host $port.ReadExisting()
            break
        }
        
        # Send command
        $port.WriteLine($cmd)
        
        # Wait a bit longer for complex commands like 'dump'
        if ($cmd -eq "dump" -or $cmd -eq "diff all") {
            Start-Sleep -Milliseconds 2000
        } else {
            Start-Sleep -Milliseconds 500
        }
        
        $output = $port.ReadExisting()
        if ($output) {
            Write-Host $output
        }
    }
} catch {
    Write-Host "Error connecting to $ComPort. Is the drone plugged in and Betaflight Configurator disconnected?" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    if ($port -and $port.IsOpen) {
        $port.Close()
        Write-Host "Connection closed."
    }
}
