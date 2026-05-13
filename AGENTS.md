# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) and other AI coding agents when working with code in this repository.

## Repository Purpose

DevKit is a collection of personal development scripts managed through a single `devkit` CLI. Scripts are divided into two categories:

- `bash-tools/<category>/*.sh` — Pure Bash tools (currently only `git/`: clean-branch, sync-all, release-tag)
- `node-tools/<category>/` — Node.js tools (currently only `env/`: a commander-based .env file manager)

When adding new tools, please follow the existing directory structure; the dispatcher will scan them automatically.

## Common Commands

```bash
# Install dependencies (first time or after updates)
pnpm install

# Development
pnpm dev                       # Execute root src/cli.js (if exists)
pnpm env -- <subcommand>       # Develop the env-manager tool

# Code Style
pnpm lint                      # eslint node-tools/*/src/**/*.js
pnpm format                    # prettier --write node-tools/*/src/**/*.js

# Execute tools via dispatcher
./devkit                       # List all categories and tools
./devkit <category>            # List tools in a specific category
./devkit <category>:<tool>     # Execute a specific tool, e.g., ./devkit git:release-tag
./devkit -i                    # Interactive menu

# env-manager subcommands (via dispatcher)
./devkit env:env init|create <name>|switch <name>|list|current|diff <a> [b]|backup|restore <name>|clean

# Global Installation
./install.sh --alias           # Add shell alias (recommended, most stable)
./install.sh --user            # Symlink to ~/.local/bin
./install.sh --system          # Symlink to /usr/local/bin (requires sudo)
./install.sh --uninstall

# Run unit tests (defined as node --test in env-manager)
cd node-tools/env && pnpm test
```

Runtime requirements: Node.js `>=18 <24`, pnpm `>=8`; `.nvmrc` is locked to 22.11.0; `packageManager` is locked to `pnpm@8.10.0`.

## Architecture

### Dispatcher (`devkit`)

A Bash script where all paths are relative to the script itself. It follows a three-stage process:

1. `get_categories()` scans `bash-tools/*/` and `node-tools/*/`. A directory is identified as a category if it contains `*.sh` files (Bash) or a `src/cli.js` / `package.json` (Node).
2. `get_category_tools($cat)` lists tools under that category. Descriptions are pulled from:
   - Bash: The `# DEVKIT_DESC: …` or `# 功能: …` comment in the script header.
   - Node: The `"description"` field in the corresponding `package.json`.
3. `execute_tool` parses `category:tool` and dispatches it to `execute_bash_tool` (runs directly after `chmod +x` if necessary) or `execute_node_tool` (checks Node version, runs `pnpm install` in the tool directory if needed, then executes `node src/cli.js`).

The CLI version is parsed from `package.json` using `grep`/`sed` to avoid a dependency on `jq`.

### Adding New Tools

**Bash Tools**: Create a file at `bash-tools/<category>/<tool>.sh`. Add `# DEVKIT_DESC: <one-line description>` in the first comment block and ensure it is executable. The dispatcher will list it automatically.

**Node Tools**: Create a directory at `node-tools/<category>/` with a `package.json` and `src/cli.js`. `src/cli.js` must be a commander entry point. If the tool name matches the category name (e.g., `env:env`), it is called as a root CLI; otherwise, the first positional argument is treated as a subcommand.

### Shared Utilities (`src/utils/`)

Node tools can reuse utilities from the root `src/utils/`: `logger.js`, `file.js`, `config.js`, `platform.js`, `common.js`, `version-check.js`, and `node-version-manager.js`. These are implemented as ES modules (`"type": "module"`); use `import` instead of `require`.

`node-version-manager.js` can automatically switch to the version specified in `.nvmrc` before tool execution and switch back afterward (via nvm or n). Tools needing this capability should call it during initialization.

### env-manager (`node-tools/env`)

An independent sub-package with its own `package.json` and `node_modules`. `EnvManager` (`src/manager.js`) encapsulates `.env` file I/O; `BackupManager` (`src/backup.js`) handles backups/restores; the CLI entry point `src/cli.js` uses commander to register subcommands: `init`, `create`, `switch`, `list`, `current`, `diff`, `backup`, `restore`, and `clean`. Interactive prompts use `inquirer`, and output uses `chalk`.

## Language & Commits

- Default project language is Traditional Chinese (Taiwan) for code comments, commit messages, and CLI output.
- Commit message format: `<type>: [ <scope> ] <subject>`, e.g., `feat: [devkit] read version from package.json`.
- Version management refers to `UPGRADE.md` (includes Node.js upgrade steps, compatibility matrix, and rollback procedures).
