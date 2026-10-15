#requires -version 5.1
<#
.SYNOPSIS
Monta ISO Enfoque OS a partir de quatro partes verificadas do GitHub Actions.
.EXAMPLE
.\scripts\windows\juntar-iso-partes.ps1 -PartsDirectory .\dist\0.1.3-parts
#>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$PartsDirectory)
$ErrorActionPreference='Stop'
$dir=(Resolve-Path -LiteralPath $PartsDirectory).ProviderPath
$source=Join-Path $dir 'SHA256SUMS'
$manifest=Join-Path $dir 'SHA256_PARTS'
if(!(Test-Path -LiteralPath $source) -or !(Test-Path -LiteralPath $manifest)){
    throw 'SHA256SUMS e SHA256_PARTS sao obrigatorios ao lado das quatro partes.'
}
$isoLines=@(Get-Content -LiteralPath $source | Where-Object { $_ -match '^([a-fA-F0-9]{64})\s+\*?(?:\./)?(enfoque-os-[0-9]+\.[0-9]+\.[0-9]+-piloto-amd64\.iso)$' })
if($isoLines.Count -ne 1){throw 'SHA256SUMS nao contem uma ISO Enfoque OS unica.'}
$isoLine=[regex]::Match($isoLines[0],'^([a-fA-F0-9]{64})\s+\*?(?:\./)?(enfoque-os-[0-9]+\.[0-9]+\.[0-9]+-piloto-amd64\.iso)$')
$expectedIso=$isoLine.Groups[1].Value.ToUpperInvariant()
$name=$isoLine.Groups[2].Value
$version=[regex]::Match($name,'^enfoque-os-([0-9]+\.[0-9]+\.[0-9]+)-').Groups[1].Value
$hashes=@{}
foreach($line in (Get-Content -LiteralPath $manifest)){
    if($line -notmatch '^([a-fA-F0-9]{64})\s+\*?(?:\./)?(chunk-[0-9]{2})$'){
        throw "Linha inesperada em SHA256_PARTS: $line"
    }
    if($hashes.ContainsKey($Matches[2])){throw "Parte repetida: $($Matches[2])"}
    $hashes[$Matches[2]]=$Matches[1].ToUpperInvariant()
}
if($hashes.Count -ne 4){throw "Esperadas quatro partes, recebidas $($hashes.Count)."}
$parts=@('chunk-00','chunk-01','chunk-02','chunk-03')
foreach($part in $parts){
    $file=Join-Path $dir $part
    if(!(Test-Path -LiteralPath $file)){throw "Parte nao encontrada: $part"}
    if(!(Get-Item -LiteralPath $file).Length){throw "Parte vazia: $part"}
    $actual=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    if($actual -ne $hashes[$part]){throw "Integridade INVALIDA: $part"}
    Write-Host "SHA-256 OK: $part"
}
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).ProviderPath
$dest=Join-Path (Join-Path $root 'dist') $version
if(!(Test-Path -LiteralPath $dest)){New-Item -ItemType Directory -Path $dest | Out-Null}
$target=Join-Path $dest $name
if(Test-Path -LiteralPath $target){
    if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $expectedIso){
        throw "ISO existente de $version tem hash incorreto. Nao sobrescrita."
    }
    Write-Host "ISO $version ja existe e foi validada."
}else{
    $temp=Join-Path $dest ('.montando-'+[guid]::NewGuid().ToString('N'))
    try {
        $out=[IO.File]::Create($temp)
        try {
            foreach($part in $parts){
                $in=[IO.File]::OpenRead((Join-Path $dir $part))
                try {$in.CopyTo($out)} finally {$in.Dispose()}
            }
        } finally {$out.Dispose()}
        $actual=(Get-FileHash -LiteralPath $temp -Algorithm SHA256).Hash
        if($actual -ne $expectedIso){throw "ISO recomposta com SHA-256 incorreto: $actual"}
        Move-Item -LiteralPath $temp -Destination $target
    } finally {
        if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}
    }
}
$sumTarget=Join-Path $dest 'SHA256SUMS'
if(Test-Path -LiteralPath $sumTarget){
    if((Get-Content -LiteralPath $sumTarget -Raw) -ne (Get-Content -LiteralPath $source -Raw)){
        throw "Manifesto existente difere do manifesto da ISO validada."
    }
}else{Copy-Item -LiteralPath $source -Destination $sumTarget}
Write-Host "ISO pronta e validada: $target"
