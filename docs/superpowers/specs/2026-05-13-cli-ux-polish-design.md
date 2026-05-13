# DevKit CLI UX Polish Design

Date: 2026-05-13
Status: Approved for planning
Scope: First-stage CLI UX polish for the `devkit` Bash dispatcher

## Goal

Improve the command-line experience of DevKit without changing core dispatch behavior. The first stage focuses on professional, concise output that is easier to scan, easier to test, and safer to extend as new tools are added.

## Non-goals

- Do not redesign the interactive `devkit -i` menu in this phase.
- Do not add new tool categories or tool functionality.
- Do not change how Bash or Node tools are executed.
- Do not add new runtime dependencies.

## Target UX Style

Use a professional, concise CLI style:

- Prefer clear section headings over decorative output.
- Reduce emoji usage in normal list/help/error output.
- Keep Traditional Chinese for user-facing CLI copy, matching the project convention.
- Preserve color where it improves scanability, but do not rely on color alone to communicate errors or state.

## User-facing Behavior

### `./devkit`

Show a compact overview:

1. Product/version header, e.g. `DevKit v1.1.1`
2. `分類` section listing available categories and tool counts
3. `工具` section listing tools grouped by category
4. `使用方式` section with the most important invocation forms

Category display must not produce malformed labels such as `Ugit` or `Uenv`. Either keep category names lowercase (`git`, `env`) or render them as simple title case (`Git`, `Env`) using a portable implementation.

### `./devkit <category>`

Show a compact category view:

- Category heading
- Tool names and descriptions
- Usage hint for `devkit <category>:<tool>`

If the category does not exist, return a non-zero exit code and show:

- A clear error line
- Available categories
- No stack trace or noisy diagnostics

### `./devkit <category>:<tool>`

Keep dispatch semantics unchanged.

If the tool does not exist, return a non-zero exit code and show:

- A clear error line
- Available tools in that category, if the category exists

The current pre-execution message can be simplified, but it should still identify which tool is being run before handing control to the tool.

### `./devkit --version`

Continue reading the version from root `package.json` and print a concise version line.

## Implementation Boundaries

The primary implementation surface is `devkit`.

Likely helper-level changes:

- Replace non-portable or incorrect display capitalization logic.
- Introduce small formatting helpers for headings, errors, and list rows if they reduce repetition.
- Keep all paths relative to the script directory.
- Preserve existing category/tool discovery logic.

Tests should be added or updated under `tests/` using Node's built-in test runner, consistent with existing integration tests.

## Testing Requirements

Add CLI smoke tests that execute the `devkit` script and assert output/exit behavior for:

- `./devkit`
- `./devkit git`
- `./devkit unknown`
- `./devkit git:unknown`
- `./devkit --version`

Regression assertions:

- Output must not contain `Ugit` or `Uenv`.
- Unknown category and unknown tool cases must exit non-zero.
- Valid list/category/version commands must exit zero.
- Existing `pnpm test` and `pnpm lint` must pass.

## Risks

- Bash output formatting can be brittle across shells and platforms. Keep formatting simple and avoid shell-specific capitalization tricks.
- Tests that assert exact full output may become noisy. Prefer targeted assertions for stable strings, section headings, and exit codes.
- Changing pre-execution text could affect users who visually expect the old output. Keep the message clear and minimal rather than removing it entirely.

## Acceptance Criteria

- The default CLI list output is concise and professional.
- Category names render correctly with no `Ugit`/`Uenv` artifact.
- Error output is clear for unknown categories/tools.
- Core tool dispatch behavior remains unchanged.
- CLI smoke tests cover the UX contract.
- `pnpm test` and `pnpm lint` pass after implementation.
