const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ChatOpenAI, ChatAnthropic, ChatGemini, ChatOllama, ChatPerplexity, TracingCallbackHandler, InMemoryAuditLogger } = require('../dist');

test('provider versions come from environment with explicit config taking precedence', () => {
  const providers = [[ChatOpenAI, 'OPENAI_MODEL'], [ChatAnthropic, 'ANTHROPIC_MODEL'], [ChatGemini, 'GEMINI_MODEL'], [ChatOllama, 'OLLAMA_MODEL'], [ChatPerplexity, 'PERPLEXITY_MODEL']];
  for (const [Model, variable] of providers) {
    const previous = process.env[variable];
    try {
      delete process.env[variable];
      assert.throws(() => new Model({ apiKey: 'test-key' }), new RegExp(variable));
      process.env[variable] = 'deployment-model';
      assert.equal(new Model({ apiKey: 'test-key' }).modelName, 'deployment-model');
      assert.equal(new Model({ apiKey: 'test-key', model: 'explicit-model' }).modelName, 'explicit-model');
    } finally {
      if (previous === undefined) delete process.env[variable]; else process.env[variable] = previous;
    }
  }
});

test('trace and audit sinks redact secrets without changing caller input', async () => {
  const traces = new TracingCallbackHandler();
  const input = { apiKey: 'opaque-value-that-must-not-be-logged', user: 'hello' };
  await traces.onChainStart('test', input, 'run-test');
  await traces.onChainEnd(input, 'run-test');
  assert.ok(!JSON.stringify(traces.getRuns()).includes(input.apiKey));
  const audit = new InMemoryAuditLogger();
  await audit.record({ id: 'test', timestamp: new Date().toISOString(), type: 'test', status: 'info', details: input });
  assert.ok(!JSON.stringify(await audit.list()).includes(input.apiKey));
  assert.equal(input.apiKey, 'opaque-value-that-must-not-be-logged');
});

test('source scanner blocks credentials and never prints their values', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync, spawnSync } = require('node:child_process');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'fireworks-secret-scan-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo });
    fs.mkdirSync(path.join(repo, 'scripts'));
    fs.copyFileSync(path.join(__dirname, '../scripts/check-secrets.cjs'), path.join(repo, 'scripts/check-secrets.cjs'));
    const secret = 'sk-' + 'x'.repeat(32);
    fs.writeFileSync(path.join(repo, 'bad.js'), `const leaked = '${secret}';\n`);
    const result = spawnSync(process.execPath, ['scripts/check-secrets.cjs'], { cwd: repo, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /bad.js:1/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
    fs.writeFileSync(path.join(repo, 'bad.js'), 'const model = process.env.OPENAI_MODEL;\n');
    const clean = spawnSync(process.execPath, ['scripts/check-secrets.cjs'], { cwd: repo, encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stderr);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
