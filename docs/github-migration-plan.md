# Proposed GitHub migration — not applied

Inspection on 2026-10-22 confirmed:

- Parent HEAD: `d2dc706`; its GitHub repository, `iamcharlesb/fireworks`, is public.
- Recorded browser-agent commit: `f7bc56d63f20e7e0ef7d91c4aa4ad0564d65ba7a`.
- `node/browser_agent` has only the `bitbucket` remote, pointing to `git@bitbucket.org:magicvisor/browser-agent.git`.
- A credentialed read of Bitbucket succeeded; its HEAD matches the recorded commit.
- GitHub could not resolve `iamcharlesb/browser-agent`; no mirror is assumed to exist.
- Both working trees were clean before the approval/chat changes in this task.

## Smallest proposed fix

Publish a separate browser-agent repository on GitHub and update one URL. This keeps
the submodule structure, source behavior, and Git history. Anonymous recursive
clones of the public parent require a **public** submodule. A private GitHub mirror
only works for users with access; it does not solve anonymous clones.

Publishing private source/history requires a visibility decision. No repository has
been created, no migration change has been applied, and nothing has been pushed.
The current app changes remain uncommitted in the existing submodule for review.

Exact proposed `.gitmodules` patch, after a reachable GitHub destination is verified:

```diff
 [submodule "node/browser_agent"]
 	path = node/browser_agent
-	url = git@bitbucket.org:magicvisor/browser-agent.git
+	url = https://github.com/iamcharlesb/browser-agent.git
```

## Execution after visibility approval and review

1. Review tracked files and reachable history for secrets before publishing. Keep
   `.env`, dependencies, generated builds, runtime state, and browser profiles out
   of the published source. If history needs remediation, stop for a separate
   decision; do not rewrite it silently.
2. Create `iamcharlesb/browser-agent` with the approved visibility and no generated
   README/license commits. Preserve the existing Bitbucket repository and remote.
3. Clone Bitbucket to a temporary bare repository and push its branches and tags
   to the empty GitHub repository. Use normal pushes, without force or `--mirror`:

   ```sh
   migration_dir=$(mktemp -d /private/tmp/browser-agent-migration.XXXXXX)
   git clone --bare git@bitbucket.org:magicvisor/browser-agent.git "$migration_dir/browser-agent.git"
   git -C "$migration_dir/browser-agent.git" push https://github.com/iamcharlesb/browser-agent.git --all
   git -C "$migration_dir/browser-agent.git" push https://github.com/iamcharlesb/browser-agent.git --tags
   ```

   Retain the temporary clone as a backup. Compare branch/tag refs at both hosts
   and verify the pinned commit exists on GitHub. Review and commit the app changes
   in the submodule separately if they are to be included; push that commit to the
   same GitHub branch before recording its new pointer in the parent.
4. Apply the URL patch, run `git submodule sync -- node/browser_agent`, and add a
   GitHub remote in the local submodule. Set the parent/submodule upstreams to
   GitHub only after verifying both pushes. Keep Bitbucket remotes for recovery.
5. Document recursive cloning and desktop setup in the parent README:

   ```sh
   git clone --recurse-submodules https://github.com/iamcharlesb/fireworks.git
   cd fireworks
   npm ci
   npm --prefix node/browser_agent ci
   npx --prefix node/browser_agent playwright install chromium
   npm test
   npm run bots:test
   npm run desktop
   ```

   A normal clone can be completed with `git submodule update --init --recursive`.
   Model credentials are configured locally in the app Settings or submodule
   `.env`; Git hosting credentials do not replace model/API credentials.
6. Before publishing the parent commit, test its staged URL/pointer from a fresh
   temporary checkout and ensure the submodule can be fetched without Bitbucket
   credentials. For a public mirror, also verify access with GitHub credentials
   disabled. Build/test both projects and smoke-test desktop startup. Dependency
   downloads and local platform requirements remain part of setup.
7. Show the parent diff for review. Commit/push only when authorized; verify
   the remote refs and repeat a fresh recursive GitHub clone afterward.

## Alternatives

- Keep the private submodule: smallest administrative change, but document that
  each developer needs Bitbucket access and SSH credentials. This retains the
  reported clone blocker for outside users.
- Import browser-agent into the parent with an unsquashed subtree merge: removes
  the separate clone dependency and can preserve history, but changes project
  structure and publishes the private source/history into the public parent.
  Review a complete file/history diff in an isolated checkout first. Do not delete
  the working submodule or its Git metadata to perform the conversion.
