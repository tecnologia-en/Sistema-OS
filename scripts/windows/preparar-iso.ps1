#requires -version 5.1
# Extrai artefato oficial da ISO em dist/<versao>, verifica SHA-256 e nunca sobrescreve uma versao existente.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ZipPath,[switch]$StartVM)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=(Resolve-Path -LiteralPath $ZipPath).ProviderPath
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).ProviderPath
$dist=Join-Path $root 'dist'
$a=[IO.Compression.ZipFile]::OpenRead($zip)
try {
    $entries=@($a.Entries)
    if($entries.Count -ne 2){throw 'ZIP invalido: esperado ISO + SHA256SUMS.'}
    foreach($e in $entries){if($e.FullName -ne $e.Name){throw 'Caminho inesperado no ZIP.'}}
    $isos=@($entries | Where-Object {$_.Name -match '^enfoque-os-([0-9]+\.[0-9]+\.[0-9]+)-piloto-amd64\.iso$'})
    $sums=@($entries | Where-Object {$_.Name -eq 'SHA256SUMS'})
    if($isos.Count -ne 1 -or $sums.Count -ne 1){throw 'ISO ou manifesto ausente.'}
    $name=$isos[0].Name
    $version=[regex]::Match($name,'^enfoque-os-([0-9]+\.[0-9]+\.[0-9]+)-').Groups[1].Value
    $reader=New-Object IO.StreamReader($sums[0].Open())
    try{$manifest=$reader.ReadToEnd()}finally{$reader.Dispose()}
}finally{$a.Dispose()}
$hashes=@()
foreach($line in ($manifest -split '\r?\n')){
    if($line -match '^\s*([a-fA-F0-9]{64})\s+\*?(.+?)\s*$'){
        if(($Matches[2] -replace '^\./','') -eq $name){$hashes+=($Matches[1].ToUpperInvariant())}
    }
}
if($hashes.Count -ne 1){throw 'SHA256SUMS sem hash unico da ISO.'}
$expected=$hashes[0]
$dest=Join-Path $dist $version
$iso=Join-Path $dest $name
if(Test-Path -LiteralPath $dest){
    if(!(Test-Path -LiteralPath $iso) -or !(Test-Path -LiteralPath (Join-Path $dest 'SHA256SUMS'))){
        throw 'Versao existente incompleta: nada foi sobrescrito.'
    }
    Write-Host 'Versao existente: verificando hash...'
}else{
    if(!(Test-Path -LiteralPath $dist)){New-Item -ItemType Directory -Path $dist | Out-Null}
    $temp=Join-Path $dist ('.preparar-'+[guid]::NewGuid().ToString('N'))
    try{
        Expand-Archive -LiteralPath $zip -DestinationPath $temp
        $obtido=(Get-FileHash -LiteralPath (Join-Path $temp $name) -Algorithm SHA256).Hash
        if($obtido -ne $expected){throw "SHA-256 incorreto: $obtido"}
        Move-Item -LiteralPath $temp -Destination $dest
    }finally{
        if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Recurse -Force}
    }
}
$actual=(Get-FileHash -LiteralPath $iso -Algorithm SHA256).Hash
if($actual -ne $expected){throw "SHA-256 incorreto: $actual"}
Write-Host "SHA-256 OK: $name"
Write-Host "ISO pronta: $iso"
if($StartVM){ & (Join-Path $PSScriptRoot 'testar-iso.ps1') -IsoPath $iso -StartVM }
