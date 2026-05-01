<!-- Thanks for the contribution. Fill in the sections that apply. -->

## What changed
<!-- One or two sentences. The "what" — not the "why" yet. -->

## Why
<!-- The problem this solves. Link the issue if there is one. -->
Closes #

## How verified
<!-- Tests added / commands run / screenshots / before-after. Be specific. -->

## Risk / rollout
<!-- Anything that could break existing users? Migrations? New env vars? -->

## Checklist
- [ ] Lint, typecheck, and build pass locally (`npm run lint && npm run typecheck && npm run build`)
- [ ] Engine tests pass (`cd apps/runloop-engine && go test ./...`)
- [ ] No new hardcoded secrets, internal hostnames, or production credentials
- [ ] Docs updated if user-facing behavior changed (`README.md`, `docs/`, `CLAUDE.md`)
- [ ] If this adds a node type or queue backend, the README feature matrix is updated
