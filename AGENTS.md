# Repository Guidelines

## Project Structure & Module Organization

`leek-fund` is a VS Code extension for tracking stocks, funds, futures, and cryptocurrencies, written in TypeScript.

- `src/` — extension source code. `extension.ts` is the entry point; `registerCommand.ts` wires up commands.
- `src/explorer/` — tree-view providers and data services (fund, stock, forex, Binance).
- `src/webview/`, `src/statusbar/` — webview panels and status-bar UI.
- `src/shared/`, `src/utils/`, `src/service/`, `src/data/` — shared helpers, API clients, and static data.
- `src/_test/` — Mocha test suite (compiled to `out/_test/`).
- `template/` — HTML/JS/CSS webview templates; `template-packages/leek-center/` is a separately built front-end package.
- `types/` — ambient TypeScript declarations. Compiled output goes to `out/`.

## Build, Test, and Development Commands

Use Yarn.

- `yarn compile` — build the extension (`tsc`), then builds `template-packages/leek-center`.
- `yarn watch` — incremental TypeScript rebuilds during development.
- `yarn lint` — run ESLint with `--fix` over `src/`.
- `yarn test` — run the Mocha integration suite inside a VS Code instance (runs lint + compile first via `pretest`).
- `yarn package` — produce a `.vsix` via `vsce`.
- `yarn release` — cut a versioned release with `standard-version`.

## Coding Style & Naming Conventions

- TypeScript, strict mode, 2-space indentation, single quotes, LF line endings (see `.editorconfig`).
- Prettier (`singleQuote: true`) and ESLint (`@typescript-eslint`); lint-staged + husky run on commit. Run `yarn lint` before pushing.
- camelCase for variables/functions, PascalCase for classes; services are named `*Service.ts` and tree providers `*Provider.ts`.

## Testing Guidelines

- Framework: Mocha with `@vscode/test-electron`; tests live in `src/_test/suite/*.test.ts`.
- `pretest` enforces lint and compile automatically; run `yarn test` for the full suite. Keep new logic covered by tests where feasible.

## Commit & Pull Request Guidelines

- Commit messages follow Conventional Commits, enforced by commitlint with types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `revert` (e.g. `feat: 基金金额设置页面支持搜索快速定位`, `fix: WebSocket import`).
- PRs should include a clear description, link related issues, and add screenshots for webview/UI changes.
