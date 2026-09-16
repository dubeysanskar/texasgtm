// Shared bootstrap for CLI scripts: load .env, resolve the "@/..." alias used inside src/lib,
// and hand back the application's database layer (PostgreSQL or SQLite, same as the app).
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', process.env.GTM_ENV_FILE || '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !m[1].startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  });
}

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) request = path.join(__dirname, '..', 'src', request.slice(2));
  return origResolve.call(this, request, ...rest);
};

module.exports = require('../src/lib/db');
