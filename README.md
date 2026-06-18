# Code Pulse

**A heartbeat for your Rust code, right in the VS Code status bar.**

Save a file and Code Pulse compiles (or runs, lints, or tests) your crate in the background, then shows the result as a single, glanceable icon — a **pulse** while your server is alive, a **flatline** when it isn't, a **check** when a build or test passes, and a **red cross** the moment something breaks. No more babysitting `cargo` in the terminal while you wait.

## At a glance

| Icon | State | Meaning |
| :---: | --- | --- |
| `—` | **Idle** | Nothing running — click to build/run |
| `⟳` | **Building** | Compiling |
| `♥` | **Running** | A `run`/`test` process is alive (your server is up) |
| `✓` | **Done** | Finished successfully — compiled, ran, or tests passed |
| `✖` | **Failed** | Build error or non-zero exit — the output terminal opens automatically |

Hover the icon any time for the full story: which `cargo` command ran, how long it took, and how many errors/warnings it produced.

## Why

The Rust edit → compile → run loop involves a lot of waiting and terminal-watching. Existing tools leaned on [`cargo-watch`](https://github.com/watchexec/cargo-watch), which was archived in January 2025. Code Pulse replaces that whole dance with one quiet indicator that lives where your eyes already are — the status bar — and needs **zero external watchers or dependencies**.

## Features

- **💓 Status at a glance** — the icon tracks your code's pulse: alive, idle, passed, or broken.
- **💾 Build on save** — saving a `.rs` file triggers a debounced rebuild. No external file watcher.
- **🧭 Four modes** — `check`, `run`, `clippy`, and `test`, switchable instantly from a quick-pick (no settings spelunking).
- **⏱️ Timing & diagnostics** — the tooltip reports build/run duration and a live count of errors and warnings.
- **🧱 Locale- & version-proof** — status comes from `cargo`'s structured **JSON message stream** (`build-finished` records), not from grepping human-readable terminal text. It won't break when `cargo` rewords its output or runs in another language.
- **♻️ One terminal, reused** — output streams into a single "Code Pulse" terminal that's cleared at the start of each build instead of spawning duplicates.
- **🧹 Clean restarts** — restarting kills the entire process tree, so a long-running server never gets orphaned and tie up its port.
- **📋 Event log** — a dedicated "Code Pulse" Output channel timestamps every state transition, so the indicator is never a black box.
- **📦 Self-contained** — pure TypeScript, no runtime dependencies, no `cargo-watch`.

## How it works

Code Pulse leans on two things VS Code and `cargo` already give you for free:

1. **`vscode.workspace.onDidSaveTextDocument`** as the watcher — save a Rust file, and a build kicks off (debounced to coalesce "save all" bursts).
2. **`cargo <cmd> --message-format=json-diagnostic-rendered-ansi`** as a stable, documented contract — Code Pulse reads the machine-readable `build-finished` and `compiler-message` records to decide status, and streams the ANSI-rendered diagnostics into its terminal so the output still looks like a normal `cargo` session.

The line-classifier that turns that stream into state is a **pure, dependency-free, unit-tested function** (`parseCargoLine`) — decoupled from the VS Code API so its behavior is locked down by tests.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `codePulse.command` | `run` | What to run: `check`, `run`, `clippy`, or `test`. |
| `codePulse.runOnSave` | `true` | Rebuild automatically when a Rust file is saved. |
| `codePulse.revealTerminalOnFailure` | `true` | Pop open the output terminal when something fails. |
| `codePulse.cargoPath` | `cargo` | Path to the `cargo` executable if it isn't on your `PATH`. |

## Commands

| Command | Description |
| --- | --- |
| **Code Pulse: Build / Restart** | Start or restart the current command (also the status-bar click action). |
| **Code Pulse: Stop** | Stop the running build/server and reset to idle. |
| **Code Pulse: Show Output Terminal** | Reveal the "Code Pulse" terminal. |
| **Code Pulse: Select Command** | Pick `check` / `run` / `clippy` / `test` from a quick-pick and rebuild. |

## Getting started

Requires a working Rust toolchain (`cargo` on your `PATH`, e.g. via [rustup](https://rustup.rs)).

```bash
git clone https://github.com/mustafa-ans/code-pulse-server-status
cd code-pulse-server-status
npm install
npm run compile      # or: npm run watch
```

Press **F5** to launch the Extension Development Host, open a Cargo project, and save a `.rs` file — the icon springs to life on the left of the status bar.

## Testing

```bash
npm test
```

This compiles, lints, then runs the Mocha suite inside a throwaway VS Code instance. The cargo-output parser is covered by `src/test/suite/parser.test.ts`.

## Architecture notes

- **Pure core, thin shell.** All cargo-output interpretation lives in `parseCargoLine`, a side-effect-free function that's unit-tested independently of VS Code.
- **Single-flight builds.** One in-flight process at a time, with explicit restart semantics and cross-platform process-tree termination.
- **Observable by design.** Every transition is logged to an Output channel, making behavior easy to verify and debug.

## Roadmap

- Inline error/warning badge on the icon.
- Push `cargo` diagnostics into the **Problems** panel (squiggles in the editor).
- Configurable debounce and "pulse hold" durations.

## License

MIT — free to use, modify, and share.
