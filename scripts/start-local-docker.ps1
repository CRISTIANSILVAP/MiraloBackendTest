#!/usr/bin/env pwsh
# Script PowerShell para levantar entorno local con docker-compose
param(
  [string]$envFile = ".env"
)

if (-not (Test-Path $envFile)) {
  Write-Host ".env no encontrado. Crea un .env en la raíz del proyecto antes de continuar." -ForegroundColor Yellow
  exit 1
}

Write-Host "Construyendo y levantando contenedores con docker-compose..."
docker-compose up -d --build
Write-Host "Contenedores levantados. Ver logs: docker-compose logs -f"

