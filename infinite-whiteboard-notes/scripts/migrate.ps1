$ErrorActionPreference = "Stop"

$nodeDir = "C:\Users\jz322\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$env:PATH = "$nodeDir;$env:PATH"
$env:PNPM_HOME = "E:\codex项目\.pnpm-home"
$env:npm_config_store_dir = "E:\codex项目\.pnpm-store"
$env:npm_config_cache = "E:\codex项目\.pnpm-cache"

Set-Location (Split-Path -Parent $PSScriptRoot)
& node .\scripts\migrate.mjs
