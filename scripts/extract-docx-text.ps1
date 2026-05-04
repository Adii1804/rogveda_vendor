param(
    [Parameter(Mandatory = $true)][string]$DocxPath,
    [Parameter(Mandatory = $true)][string]$OutTxtPath
)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$tmp = Join-Path $env:TEMP ("docx_" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $tmp | Out-Null
$zipCopy = Join-Path $env:TEMP ("docxcopy_" + [guid]::NewGuid().ToString("n") + ".zip")
try {
    Copy-Item -LiteralPath $DocxPath -Destination $zipCopy -Force
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipCopy, $tmp)
    $xmlPath = Join-Path $tmp "word\document.xml"
    if (-not (Test-Path $xmlPath)) { throw "word/document.xml not found" }
    $xml = Get-Content $xmlPath -Raw -Encoding UTF8
    $txt = [regex]::Replace($xml, "<w:p[^>]*>", "`n")
    $txt = [regex]::Replace($txt, "<[^>]+>", "")
    $txt = [System.Net.WebUtility]::HtmlDecode($txt)
    $txt = ($txt -replace "(`n\s*){3,}", "`n`n").Trim()
    $txt | Set-Content -Path $OutTxtPath -Encoding UTF8
}
finally {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    if (Test-Path $zipCopy) { Remove-Item -Force $zipCopy }
}
