# Change Log

All notable changes to the "code-pulse-server-status" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.0]

- Removed the dependency on `cargo-watch` (archived January 2025).
- Build status is now driven by cargo's JSON message format (`build-finished` records) instead of grepping localized terminal text.
- Added a built-in file watcher using VS Code's save event; rebuild on save is configurable.
- Added settings: `codePulse.command` (check/run, default run), `codePulse.runOnSave`, `codePulse.revealTerminalOnFailure`, `codePulse.cargoPath`.
- Reveal the output terminal automatically on build failure.
- Reuse a single "Code Pulse" terminal across builds.
- Fixed the broken command id and extension packaging (`main` now points at compiled output; `out/` ships in the package).
- Moved the status bar indicator to the right-hand side of the status bar.
- Status bar indicator is icon-only across all states; the current `cargo` command and click action are shown in the hover tooltip.
- A clean `cargo run` exit returns to idle (no separate "exited" state).
- Closing the Code Pulse terminal stops the current run and resets the indicator; the single terminal is reused across builds and a click reveals it.
- Gave the status bar item a stable id and name so it can be toggled from the status bar context menu.
- Upgraded the test runner's `glob` dependency (8 → 10, promise API) and dropped the now-bundled `@types/glob`, clearing the deprecation warning on install.
- Relaxed the ESLint naming rule to allow idiomatic PascalCase enum members.
- Cleaned up VS Code `launch.json` / `tasks.json` / `settings.json` left over from the removed webpack build.

## [0.0.1]

- Initial release (cargo-watch based).
