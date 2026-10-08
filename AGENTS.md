<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Dev server: **http://127.0.0.1:43123** (`npm run dev`). On agent boot, `.cursor/start-dev.sh` runs via `environment.json` `start` (runs `npm ci` if `node_modules` is missing).
- If the browser shows **ERR_CONNECTION_REFUSED** on 43123, check `curl -I http://127.0.0.1:43123/` and `/tmp/cursor/start-user/start-user.log`. Without a successful environment build, `install` is skipped on boot — `start` must install deps.
- Typecheck: `npx tsc --noEmit`. Lint: `npm run lint` (vendored `public/pdf.worker.min.mjs` is ignored).
