# Repository instructions

- Preserve unrelated work in the parent repository and browser-agent submodule.
- Model versions, provider credentials, pricing and operational limits belong in environment configuration. Never print or commit secrets.
- Keep policy checks and known event handling in application code. A notification must not implicitly start a model, browser action or paid recurring job.
- Agent context consists of compact operating instructions, a separate voice file, and relevant playbooks. Load details on demand; keep model-proposed lessons pending until reviewed.
- Run `npm test` for framework changes and `npm --prefix node/browser_agent test` for browser-runtime changes. Both include secret scans. Browser tests compile into `.test-dist` to avoid the dev watcher.
- The browser agent is a local, single-operator tool. MongoDB change streams do not supply account isolation or exactly-once execution of outward actions.
