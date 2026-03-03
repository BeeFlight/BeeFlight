$port = 8080
$path = $PWD.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Listening on http://localhost:$port/ ..."

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $reqPath = $request.Url.LocalPath
        if ($reqPath -eq '/') { $reqPath = '/index.html' }
        $reqPath = $reqPath.Replace('/', '\')
        $fullPath = Join-Path $path $reqPath
        
        if (Test-Path $fullPath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($fullPath)
            $response.ContentLength64 = $content.Length
            
            $ext = [System.IO.Path]::GetExtension($fullPath)
            switch ($ext) {
                '.html' { $response.ContentType = 'text/html; charset=utf-8' }
                '.css' { $response.ContentType = 'text/css' }
                '.js' { $response.ContentType = 'application/javascript' }
                '.png' { $response.ContentType = 'image/png' }
                '.jpg' { $response.ContentType = 'image/jpeg' }
                default { $response.ContentType = 'application/octet-stream' }
            }
            
            $output = $response.OutputStream
            $output.Write($content, 0, $content.Length)
            $output.Close()
            Write-Host "200 OK: $($request.Url.LocalPath)"
        }
        else {
            $response.StatusCode = 404
            $output = $response.OutputStream
            $output.Close()
            Write-Host "404 Not Found: $($request.Url.LocalPath)" -ForegroundColor Red
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
