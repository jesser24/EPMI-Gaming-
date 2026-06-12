@echo off
title Installation EPMI Gaming Fullstack
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js n'est pas installe. Installe Node.js LTS puis relance ce fichier.
  pause
  exit /b
)
cd backend
call npm install
cd ..\frontend
call npm install
cd ..
echo Installation terminee.
pause
