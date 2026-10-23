# GitHub browser-agent migration

Migrated on 2026-10-22 from `magicvisor/browser-agent` on Bitbucket to
<https://github.com/iamcharlesb/browser-agent>.

## Visibility and access

The GitHub browser-agent repository is **private**, preserving the source
repository's visibility. The parent `iamcharlesb/fireworks` repository is public.
Developers need GitHub access to **both** repositories for a recursive clone.
Anonymous clones of the parent cannot fetch this private submodule.

Making browser-agent public is a separate visibility decision. No private source
or history was made public during this move. Browser-agent is the custom
TypeScript/Playwright/Electron app in this project, separate from
`browser-use/browser-use`.

## Preserved history and structure

- Bitbucket advertised one branch, `main`, and no tags at migration time.
- GitHub received `main` at `cb8594a3ddadff43257acbcb2e0a41a4bc7eef62`, including
  its complete ancestor history. All local branches/tags were included in normal
  pushes, without force or history rewriting.
- The parent keeps the same submodule path and pinned commit. Only the hosting URL
  changes; no application source behavior changes in the migration.
- GitHub is the local submodule's `origin` and the upstream for its `main` branch.
- Existing Bitbucket repositories and remotes remain available as backups.

The `.gitmodules` URL changes from
`git@bitbucket.org:magicvisor/browser-agent.git` to
`https://github.com/iamcharlesb/browser-agent.git`.

## Setup

With GitHub credentials and access to the private submodule:

```sh
git clone --recurse-submodules https://github.com/iamcharlesb/fireworks.git
cd fireworks
npm ci
npm --prefix node/browser_agent ci
cd node/browser_agent
npx playwright install chromium
cd ../..
npm test
npm run bots:test
npm run desktop
```

For an existing checkout:

```sh
git pull
git submodule sync --recursive
git submodule update --init --recursive
```

Use local app Settings or `node/browser_agent/.env` for model credentials.
GitHub credentials authenticate Git access, not model/API calls. Generated
dependencies, build output, browser profiles, and runtime state are not migrated.
