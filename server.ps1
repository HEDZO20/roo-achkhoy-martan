$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8080
$prefix = "http://localhost:$port/"
$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg';
  '.jpeg'='image/jpeg'; '.webp'='image/webp'; '.csv'='text/csv; charset=utf-8'; '.txt'='text/plain; charset=utf-8';
  '.webmanifest'='application/manifest+json'
}
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "Не удалось запустить локальный сервер: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Попробуйте запустить START_SERVER.bat от имени администратора или установите Python." -ForegroundColor Yellow
  Read-Host "Нажмите Enter"
  exit 1
}
Start-Process $prefix
Write-Host "ONLINE V24 запущен: $prefix" -ForegroundColor Green
Write-Host "Не закрывайте это окно во время работы сайта." -ForegroundColor Yellow
while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $root $path))
    if (-not $full.StartsWith([IO.Path]::GetFullPath($root))) { throw 'Forbidden' }
    if (-not (Test-Path $full -PathType Leaf)) { $context.Response.StatusCode = 404; $bytes=[Text.Encoding]::UTF8.GetBytes('404'); }
    else {
      $ext=[IO.Path]::GetExtension($full).ToLowerInvariant()
      $context.Response.ContentType = $(if($mime.ContainsKey($ext)){$mime[$ext]}else{'application/octet-stream'})
      $bytes=[IO.File]::ReadAllBytes($full)
      $context.Response.StatusCode=200
    }
    $context.Response.ContentLength64=$bytes.Length
    $context.Response.OutputStream.Write($bytes,0,$bytes.Length)
    $context.Response.OutputStream.Close()
  } catch {
    try { $context.Response.StatusCode=500; $context.Response.Close() } catch {}
  }
}
