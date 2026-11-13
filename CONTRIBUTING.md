# Contributing

Thank you for contributing. Read `AGENTS.md`, `README.md` and
`developmentPlan.md` before making changes.

## Branches

| Branch      | Purpose                                                  |
| ----------- | -------------------------------------------------------- |
| `main`      | Stable, reviewed history. Only receives merges from `dev`. |
| `dev`       | Integration branch. All day-to-day work lands here.      |
| `feature/*` | Optional short-lived branches off `dev` for larger work. |

## Workflow

1. Pick a roadmap item from `roadmap.md` and confirm its state in
   `project_status.md`.
2. Describe the planned change (files, behaviour, tests) and get approval.
3. Implement in small steps with tests.
4. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` (once the workspace exists).
5. Update `project_status.md` and, where relevant, `context.md`, `README.md`
   and ADRs in `docs/decisions/`.
6. Commit — one commit per completed task.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short imperative summary>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`, `perf`.

Examples:

```
feat(records): validate record payloads against field metadata
test(tenancy): add cross-tenant record access tests
docs: add ADR for record soft deletion
```

Keep messages about the change itself. Do not add tool, assistant or
generator attribution lines.

## Definition of done

See `README.md` §14. In short: correct layer, server-side authorization and
tenant scope, validated contracts, tests for success/failure/tenant
boundaries, updated docs and migrations, and all existing tests passing.

## Architecture changes

Changing a baseline decision requires a new or superseding ADR in
`docs/decisions/` and approval before implementation.

## License

By contributing you agree that your contributions are licensed under the
GNU Affero General Public License v3.0 (see `LICENSE`).
