# Deploy TETRA//Y2K to GitHub Pages

## Goal
Publish the `cyber-tetris` game so it is live at `https://charles-le-ponzi.github.io/cyber-tetris/`.

## Current context / assumptions
- Workspace: `H:/HermesWorkspace/cyber-tetris` (a git repo, branch `main`).
- The site is a single self-contained file `index.html` (no build step, no `dist/`, no assets). GitHub Pages can serve it straight from the repo root.
- Remote is already configured: `origin` → `https://github.com/charles-le-ponzi/cyber-tetris.git`.
- The repo already exists on GitHub (previous commits were pushed there).
- There are UNCOMMITTED changes to `index.html` (the landscape/portrait layout fix from the prior session). These must be committed before deploying.
- `gh` CLI is installed (v2.100.0) and `GITHUB_TOKEN` is present in `AppData\Local\hermes\.env`.
- Known push gotcha (from memory): a plain `git push origin` HANGS on the credential prompt. Push via the token URL with `GIT_TERMINAL_PROMPT=0`, then strip the token from the stored remote URL.
- Shell is git-bash (POSIX syntax). Use `C:/`-style forward-slash paths for native tools.
- Expected live URL: `https://charles-le-ponzi.github.io/cyber-tetris/` (repo name, not `username.github.io` root, because it's a project repo).

## Architecture / proposed approach
No code changes are needed to the game. Deployment is: (1) commit the pending `index.html` fix, (2) push `main`, (3) enable GitHub Pages on the `main` branch serving from `/` (repo root) via the GitHub REST API through `gh`, (4) poll the build status until it reports `built` and the URL returns HTTP 200. Because the game is one file at the repo root, no Pages config file, no CNAME, and no build workflow are required.

## Step-by-step tasks

### Task 1 — Commit the pending layout fix
The working tree has uncommitted changes to `index.html`. Commit them so the deployed version matches what was verified.

```bash
cd H:/HermesWorkspace/cyber-tetris
git add index.html
git commit -m "Fix landscape board scaling + rebuild phone-portrait UI from the ground up"
```

Expected output: a commit line ending with `1 file changed, 132 insertions(+), 65 deletions(-)` (numbers may differ slightly).
Verify: `git status` → `working tree clean` (nothing to commit).

Note: a harmless warning `LF will be replaced by CRLF` may appear. Ignore it.

Commit. (This is the only commit; no further code changes.)

### Task 2 — Push `main` to origin via token URL
A plain `git push origin` hangs on the credential prompt. Use the token URL and disable the prompt.

```bash
cd H:/HermesWorkspace/cyber-tetris
export TOKEN=$(grep '^GITHUB_TOKEN=' "$LOCALAPPDATA/hermes/.env" | cut -d= -f2-)
GIT_TERMINAL_PROMPT=0 git push "https://x:${TOKEN}@github.com/charles-le-ponzi/cyber-tetris.git" main
```

Expected output: `To https://github.com/charles-le-ponzi/cyber-tetris.git` followed by `   <old-sha>..<new-sha>  main -> main` (or `Everything up-to-date` if already pushed).
If it fails with `403`/`401`, the token lacks `repo` scope or is expired — stop and report; do not retry with a different credential.

Immediately strip the token from the stored remote so it is not left in `.git/config`:
```bash
git remote set-url origin https://github.com/charles-le-ponzi/cyber-tetris.git
git remote -v
```
Expected: both `fetch`/`push` show the URL with no `x:<token>@`.
Sanity-check the token is not left in the config: `grep -c "TOKEN" .git/config` → `0`.

Commit. (Push is a side effect; nothing to commit, but confirm the clean state before moving on.)

### Task 3 — Enable GitHub Pages on `main` from repo root
Use the GitHub REST API via `gh` to point Pages at the `main` branch, root `/`. This is the "deploy from a branch" source (not a workflow build), and it is idempotent (re-setting the same source is safe).

```bash
cd H:/HermesWorkspace/cyber-tetris
gh auth status
gh api -X POST repos/charles-le-ponzi/cyber-tetris/pages \
  -f "source[branch]=main" \
  -f "source[path]=/"
```

Expected output: JSON describing the Pages site, including `"html_url":"https://charles-le-ponzi.github.io/cyber-tetris"`.
If `gh auth status` shows no auth, set it from the token first: `echo "$TOKEN" | gh auth login --with-token` (re-export `TOKEN` as in Task 2).
If the API returns `409`/`already exists`, that's fine — it means Pages is already configured; proceed to Task 4.

Commit. (No file changes.)

### Task 4 — Verify the build and live URL
Poll the Pages status until it reports `built`, then confirm the URL serves the game.

```bash
cd H:/HermesWorkspace/cyber-tetris
# Poll status (first build can take ~30-90s)
for i in $(seq 1 12); do
  STATUS=$(gh api repos/charles-le-ponzi/cyber-tetris/pages/builds/latest --jq '.status' 2>/dev/null)
  echo "attempt $i: status=$STATUS"
  [ "$STATUS" = "built" ] && break
  sleep 10
done
```
Expected: `status=built` within the loop. If it stays `building` past ~2 minutes, check `gh api repos/charles-le-ponzi/cyber-tetris/pages/builds/latest --jq '.error'` for a build error and report it.

Then confirm the site is live and is actually the game:
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://charles-le-ponzi.github.io/cyber-tetris/
curl -s https://charles-le-ponzi.github.io/cyber-tetris/ | grep -c "TETRA"
```
Expected: `HTTP 200` and a count `>= 1` (the page contains the TETRA//Y2K title).
If `HTTP 404` right after `built`, wait ~30s and re-curl (CDN propagation). If still 404, the deploy path is wrong — re-check Task 3's `source[path]`.

Commit. (No file changes; this is verification only.)

## Tests / validation
This is a deployment task, not a code change, so there is no unit-test cycle. Validation is end-to-end and is the gate for each step:
- Task 1: `git status` clean after commit.
- Task 2: push output shows `main -> main`; `grep -c "TOKEN" .git/config` → `0`.
- Task 3: `gh api` returns the Pages `html_url`.
- Task 4 (the real acceptance test): `curl` returns `HTTP 200` and the body contains `TETRA`.
- Optional visual check: open `https://charles-le-ponzi.github.io/cyber-tetris/` in a browser and confirm the game boots (menu overlay with "INSERT COIN"), matching the local `file://` behavior already verified in the prior session.

## Risks, tradeoffs, and open questions
- **Token scope:** if `GITHUB_TOKEN` lacks `repo` scope, the push (Task 2) and `gh api` (Task 3) will 403. Mitigation: stop and report; do not fabricate a working deploy.
- **Token hygiene:** the token is only ever placed in the transient push URL and is stripped from `.git/config` immediately after. Never write it to a file or echo it.
- **First-build latency:** GitHub Pages' first build for a new repo can take up to ~2 minutes; the poll loop accounts for this.
- **Caching:** a stale 404 immediately after `built` is usually CDN propagation, not a real failure — re-check after a short wait before declaring failure.
- **Open question:** the repo currently has no `CNAME` and uses the default `*.github.io` subdomain. If the user later wants a custom domain, that's a separate task (CNAME file + DNS) and is out of scope here.
- No build step, no sub-`/` path issues, no asset base-URL problems — the single-file design makes this a clean root deploy.
