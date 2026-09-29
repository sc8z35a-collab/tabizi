#!/bin/sh
# Rebuild the headless verification environment (Playwright + SwiftShader Chromium).
set -e
mkdir -p /tmp/pw && cd /tmp/pw
[ -d node_modules/playwright ] || { npm init -y >/dev/null; npm i playwright@1.47.2 >/dev/null 2>&1; }
npx playwright install chromium >/dev/null 2>&1 || true
sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxkbcommon0 libpango-1.0-0 libcairo2 libasound2 libnss3 fonts-noto-cjk >/dev/null 2>&1 || true
echo ready
