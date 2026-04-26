@echo off
title ATA SaaS - Server + Tunnel
color 0A

echo.
echo  =====================================
echo   ATA SaaS Starting...
echo  =====================================
echo.

:: Kill old processes
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 1 >nul

:: Start Node server
cd /d d:\ataproject
start "ATA-Server" cmd /k "node src\server.js"
timeout /t 3 >nul

:: Start Cloudflare tunnel and capture URL
echo  Starting Cloudflare tunnel...
start "ATA-Tunnel" cmd /k ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000"

echo.
echo  =====================================
echo   Both windows are open.
echo.
echo   1. Wait 5-10 seconds for the tunnel URL
echo   2. Copy the https://....trycloudflare.com URL
echo   3. Paste it in Meta webhook settings
echo   4. Add /webhooks/whatsapp at the end
echo  =====================================
echo.
pause
