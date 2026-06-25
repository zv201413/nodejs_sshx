#!/bin/sh
npm install --production --no-audit --no-fund 2>&1
exec node index.js
