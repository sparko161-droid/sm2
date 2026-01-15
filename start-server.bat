@echo off
:: Set code page to UTF-8
chcp 65001 >nul
cd /d "%~dp0"
:: Launch PowerShell script with Bypass policy and no exit to see output
powershell -NoExit -ExecutionPolicy Bypass -Command "& '%~dp0start-server.ps1'"
