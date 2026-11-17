@echo off
setlocal
REM Creates D:\BalancioApp -> this Flutter project (no spaces).
REM Open D:\BalancioApp in Cursor / Android Studio, then flutter run.

set "TARGET=%~dp0"
if "%TARGET:~-1%"=="\" set "TARGET=%TARGET:~0,-1%"
set "LINK=D:\BalancioApp"

echo Target: %TARGET%
echo Link:   %LINK%
echo.

if exist "%LINK%" (
  echo Removing previous junction/folder at %LINK% ...
  rmdir "%LINK%" 2>NUL
  if exist "%LINK%" (
    echo Could not remove %LINK%. Delete it manually and re-run this script.
    pause
    exit /b 1
  )
)

mklink /J "%LINK%" "%TARGET%"
if errorlevel 1 (
  echo.
  echo mklink failed. Right-click this file -^> Run as administrator, then try again.
  pause
  exit /b 1
)

echo.
echo Done. Now:
echo   1. File -^> Open Folder -^> D:\BalancioApp
echo   2. Run the app from that folder ^(not from \\Shared\...^)
echo.
explorer "%LINK%"
pause
