param([int]$ExcludeProcessId)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -Path (Join-Path $PSScriptRoot 'companion-window-tracker.cs')
[WhaleWindowTracker]::Run($ExcludeProcessId)
