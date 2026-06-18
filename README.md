# Code Pulse

A small VS Code extension that shows your Rust project's build and server status in the status bar. Save a `.rs` file and the status bar icon tells you whether the code is compiling, running, or broken — so you don't have to keep switching to the terminal while you wait for a slow Rust build.

It's aimed at people who do a lot of manual edit-compile-test loops (including beginners): make a change, save, glance at the status bar.

## Status

Revived and self-contained. The original version was built on [`cargo-watch`](https://github.com/watchexec/cargo-watch), which was archived (read-only) in January 2025. This version drops that dependency entirely.

## How it works

Code Pulse doesn't need an external file-watcher tool. It uses two things VS Code and cargo already provide:

1. **VS Code's own save event** as the watcher — when you save a Rust file, a build is triggered.
2. **cargo's machine-readable JSON output** (`cargo <cmd> --message-format=json-diagnostic-rendered-ansi`) to read the result. Build status comes from the structured `build-finished` record, not from grepping localized terminal text — so it doesn't break when cargo changes its wording or on different platforms.

Output streams into a reusable "Code Pulse" terminal that looks like a normal cargo session. The indicator lives on the **right-hand side** of the status bar.

## Status bar states

The indicator is **icon-only** — hover it for a tooltip that names the current `cargo` command and what a click does. It sits on the left-hand side of the status bar. The icon follows the project's namesake: a **pulse** (`♥`) when a `cargo run` server is alive, a **flatline** (`—`) when it isn't.

| Icon | Meaning |
| --- | --- |
| `—` (flatline) | Idle / not running — click to build/run |
| `⟳` (spinning) | Building |
| `✓` | `cargo check` succeeded |
| `♥` (pulse) | `cargo run` built; the binary/server is up |
| `✖` (red) | Build failed; the output terminal is revealed |

The pulse persists only while the process stays alive — i.e. a real long-running server. A short `cargo run` that prints and exits flashes the pulse, then returns to idle. Closing the Code Pulse terminal stops the current run and resets the icon.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `codePulse.command` | `run` | `check` (faster, just verifies it compiles) or `run` (compiles and launches the binary/server). |
| `codePulse.runOnSave` | `true` | Rebuild automatically when a Rust file is saved. |
| `codePulse.revealTerminalOnFailure` | `true` | Pop open the output terminal when a build fails. |
| `codePulse.cargoPath` | `cargo` | Path to the cargo executable if it isn't on your PATH. |

## Commands

- **Code Pulse: Build / Restart** — start or restart a build (also the status-bar click action).
- **Code Pulse: Stop** — stop the current build/server.
- **Code Pulse: Show Output Terminal** — reveal the output terminal.
- **Code Pulse: Select Build Command (check / run)** — switch between `cargo check` and `cargo run` from a quick-pick; it saves the setting and rebuilds.

## Running locally

1. Clone the repository.
2. `npm install`
3. `npm run compile` (or `npm run watch` for incremental builds).
4. Press `F5` to launch the Extension Development Host.
5. Open a Rust workspace (one containing `Cargo.toml`) and save a `.rs` file.

Requires a working Rust toolchain (`cargo` on your PATH, e.g. via [rustup](https://rustup.rs)).

## Tests

Unit tests run through VS Code's test host:

```
npm test
```

This compiles, lints, then downloads a throwaway VS Code build and runs the Mocha suite. The cargo-output parser is covered by `src/test/suite/parser.test.ts`. The first run is slower because it downloads VS Code.

## License

MIT — free to use.
