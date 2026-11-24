# Purge Cloudflare's cache for the files a deploy changed.
#
# Paste this into Deploy Site -> Add a deploy script (kind: PowerShell). It runs
# after the site is copied to the deploy folders.
#
# Keep the token out of this file: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID
# as environment variables, or in the .env beside hbm-config.json. The app
# passes those to the script.

$ErrorActionPreference = 'Stop'

$token = $env:CLOUDFLARE_API_TOKEN
$zone = $env:CLOUDFLARE_ZONE_ID
$baseUrl = if ($env:CLOUDFLARE_PURGE_BASE_URL) { $env:CLOUDFLARE_PURGE_BASE_URL } else { 'https://rules.example.com/5e' }

if (-not $token -or -not $zone) {
  Write-Error 'CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID is not set.'
  exit 1
}

# One site path per line, from the app: build outputs plus every file the
# enabled customizations write.
$paths = @($env:HBM_CHANGED_FILES -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$base = $baseUrl.TrimEnd('/')
$urls = @($paths | ForEach-Object { "$base/$_" })

# Cloudflare takes at most 30 files per purge request.
for ($i = 0; $i -lt $urls.Count; $i += 30) {
  # @() keeps a one-URL chunk a JSON array.
  $chunk = @($urls[$i..([Math]::Min($i + 29, $urls.Count - 1))])
  $body = @{ files = $chunk } | ConvertTo-Json
  Invoke-RestMethod -Method Post `
    -Uri "https://api.cloudflare.com/client/v4/zones/$zone/purge_cache" `
    -Headers @{ Authorization = "Bearer $token" } `
    -ContentType 'application/json' `
    -Body $body | Out-Null
}

Write-Output "Purged $($urls.Count) URL(s) from Cloudflare's cache."
