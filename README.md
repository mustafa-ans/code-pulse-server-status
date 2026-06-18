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

| State | Status bar | Meaning |
| --- | --- | --- |
| Idle | `○ Code Pulse` | Ready — click to build |
| Building | `⟳ Building…` | Compiling |
| Build OK | `✓ Build OK` | `cargo check` succeeded |
| Running | `❤ Running` | `cargo run` build succeeded; the binary/server is up |
| Exited | `⊘ Exited` | The `cargo run` process finished and exited cleanly — click to run again |
| Failed | `⊗` (red, icon only) | Build failed; the output terminal is revealed |

The `Running` (pulse) state persists only while the process stays alive — i.e. a real long-running server. A short `cargo run` that prints and exits will flash `Running` and then settle on `Exited`.

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

## Running locally

1. Clone the repository.
2. `npm install`
3. `npm run compile` (or `npm run watch` for incremental builds).
4. Press `F5` to launch the Extension Development Host.
5. Open a Rust workspace (one containing `Cargo.toml`) and save a `.rs` file.

Requires a working Rust toolchain (`cargo` on your PATH, e.g. via [rustup](https://rustup.rs)).

## License

MIT — free to use.
