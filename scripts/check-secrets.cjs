#!/usr/bin/env node
/** Scan Git-indexed working files, including initialized submodules. Never print matches. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const patterns = [
  ['provider credential', /\b(?:sk-(?:proj-|ant-)?|xai-|gh[pousr]_)[A-Za-z0-9_-]{24,}\b/g],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['credential-bearing URI', /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql):\/\/[^\s/:]+:[^\s/@]+@/gi],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g]
];
let checked = 0;
let failures = 0;
const secretValues = [];
function loadLocalSecrets(repo) {
  const file = path.join(repo, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match || !/(?:API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY|MONGODB_URI|DATABASE_URL)/i.test(match[1])) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value.length >= 12) secretValues.push(value);
  }
}
function scan(repo) {
  loadLocalSecrets(repo);
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repo }).toString().split('\0').filter(Boolean);
  for (const file of files) {
    const absolute = path.join(repo, file);
    if (!fs.existsSync(absolute)) continue;
    if (fs.statSync(absolute).isDirectory()) { scan(absolute); continue; }
    if (/\.env(?:\.(?!example$).*)?$/.test(path.basename(file))) {
      // An ignored local .env is absent from ls-files. Any included one is unsafe.
      console.error(`${path.relative(root, absolute)}: environment file included in repository`);
      failures++; continue;
    }
    const text = fs.readFileSync(absolute, 'utf8');
    if (text.includes('\0')) continue;
    checked++;
    for (const [index, line] of text.split('\n').entries()) {
      const location = `${path.relative(root, absolute)}:${index + 1}`;
      for (const [label, pattern] of patterns) {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          // Documented placeholders, never an entire test-file exemption.
          if (/YOUR_|PASSWORD|PLACEHOLDER|EXAMPLE|dummy|fake|test-key/.test(match[0])) continue;
          console.error(`${location}: possible ${label}`); failures++;
        }
      }
      if (secretValues.some(value => line.includes(value) || line.includes(encodeURIComponent(value)))) {
        console.error(`${location}: configured local secret found in source`); failures++;
      }
    }
  }
}
scan(root);
console.log(`Secret scan: ${checked} files checked; ${failures} findings. Values are never printed.`);
process.exitCode = failures ? 1 : 0;
