@echo off
title EPMI Gaming Fullstack
start "EPMI Backend" cmd /k "cd backend && npm run dev"
start "EPMI Frontend" cmd /k "cd frontend && npm run dev"
timeout /t 4 > nul
start http://localhost:5173
