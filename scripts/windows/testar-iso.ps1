#requires -version 5.1
<#
.SYNOPSIS
Confere SHA-256 de uma ISO Live e (opcionalmente) monta no VirtualBox.
.DESCRIPTION
Apenas para a maquina de TESTES. Nao cria, modifica ou apaga discos reais.
A VM precisa estar desligada. Nao altera a VM de desenvolvimento.
.EXAMPLE
.\scripts\windows\testar-iso.ps1 -IsoPath ".\dist\0.1.2\enfoque-os-0.1.2-piloto-amd64.iso" -StartVM
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $IsoPath,
    [string] $VMName = 'Enfoque OS - Teste',
    [switch] $StartVM
)
$ErrorActionPreference = 'Stop'
$iso = (Resolve-Path -LiteralPath $IsoPath -ErrorAction Stop).ProviderPath
if ([IO.Path]::GetExtension($iso) -ne '.iso') {
    throw 'Arquivo informado nao tem extensao .iso.'
}
$checksumFile = Join-Path (Split-Path -Parent $iso) 'SHA256SUMS'
if (!(Test-Path -LiteralPath $checksumFile)) {
    throw "Arquivo SHA256SUMS ausente ao lado da ISO: $checksumFile"
}
$name = Split-Path -Leaf $iso
$expected = @(
    Get-Content -LiteralPath $checksumFile | ForEach-Object {
        if ($_ -match '^([a-fA-F0-9]{64})\s+\*?(.+)$') {
            if ($Matches[2] -eq $name -or $Matches[2] -eq "./$name") {
                $Matches[1].ToUpperInvariant()
            }
        }
    }
)
if ($expected.Count -ne 1) {
    throw "Esperado 1 hash SHA256 para $name no arquivo; encontrado $($expected.Count)."
}
$actual = (Get-FileHash -LiteralPath $iso -Algorithm SHA256).Hash
if ($actual -ne $expected[0]) {
    throw "INTEGRIDADE INVALIDA: ISO $name (esperado $($expected[0]), obtido $actual)."
}
Write-Host "SHA-256 OK: $name"
$vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
if (!(Test-Path -LiteralPath $vbox)) { throw "VirtualBox nao encontrado em $vbox" }
$info = & $vbox showvminfo $VMName --machinereadable 2>&1
if ($LASTEXITCODE -ne 0) { throw "VM '$VMName' nao encontrada: $info" }
$stateLine = @($info | Where-Object { $_ -match '^VMState=' }) | Select-Object -First 1
if ($stateLine -ne 'VMState="poweroff"') {
    throw "Desligue a VM '$VMName' antes de trocar a ISO. Estado atual: $stateLine"
}
& $vbox storageattach $VMName --storagectl SATA --port 1 --device 0 --type dvddrive --medium $iso
if ($LASTEXITCODE -ne 0) { throw 'Falha ao montar ISO no leitor virtual' }
Write-Host "ISO montada na VM de testes: $VMName"
if ($StartVM) {
    & $vbox startvm $VMName --type gui
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar a VM de testes' }
    Write-Host 'VM de testes iniciada. Verifique visualmente o boot e o desktop.'
}
