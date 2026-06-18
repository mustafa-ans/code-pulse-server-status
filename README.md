# Code Pulse

A heartbeat for your Rust code, right in the VS Code status bar.

Save a file and Code Pulse builds (or runs, lints, or tests) your crate in the background, then shows the result as one glanceable icon: a pulse while your server is alive, a flatline when it isn't, a check when a build or test passes, and a red cross the moment something breaks. No more babysitting cargo in a terminal while you wait.

## At a glance

| State | Icon | Meaning |
| --- | --- | --- |
| Idle | flatline | Nothing running. Click to build or run. |
| Building | spinner | Compiling. |
| Running | pulse | A run or test process is alive (your server is up). |
| Done | check | Finished successfully: compiled, ran, or tests passed. |
| Failed | red cross | Build error or non-zero exit. The output terminal opens. |

Hover the icon for the details: which cargo command ran, how long it took, and how many errors or warnings it produced.

## Why it exists

The Rust edit, compile, run loop involves a lot of waiting and terminal watching. Earlier tools leaned on cargo-watch, which was archived in January 2025. Code Pulse does the same job with one quiet indicator that sits where your eyes already are, and it needs no external watcher and no runtime dependencies.

## Features

- Status at a glance. The icon tracks your code's pulse: alive, idle, passed, or broken.
- Build on save. Saving a `.rs` file triggers a debounced rebuild, with no external file watcher.
- Four modes. `check`, `run`, `clippy`, and `test`, switchable from a quick pick.
- Timing and diagnostics. The tooltip shows build and run time plus a live error and warning count.
- Robust by design. Status comes from cargo's structured JSON (`build-finished` records), not from scraping localized terminal text, so it survives cargo rewording its output or running in another language.
- One terminal. Output streams into a single "Code Pulse" terminal that clears at the start of each build instead of piling up.
- Clean restarts. Restarting kills the whole process tree, so a long running server never gets orphaned on its port.
- Event log. A "Code Pulse" output channel timestamps every state change, so the indicator is never a black box.
- Self contained. Pure TypeScript, no runtime dependencies, no cargo-watch.

## How it works

Code Pulse leans on two things VS Code and cargo already provide:

1. `vscode.workspace.onDidSaveTextDocument` as the watcher. Save a Rust file and a build starts, debounced so a "save all" fires once.
2. `cargo <cmd> --message-format=json-diagnostic-rendered-ansi` as a stable, documented contract. Code Pulse reads the `build-finished` and `compiler-message` records to decide status, and streams the rendered diagnostics into its terminal so the output still looks like a normal cargo session.

The line classifier that turns that stream into state (`parseCargoLine`) is a pure, dependency free function with its own unit tests, kept separate from the VS Code API.

## Requirements

A working Rust toolchain with `cargo` on your PATH (for example via [rustup](https://rustup.rs)), and VS Code 1.81 or newer.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `codePulse.command` | `run` | What to run: `check`, `run`, `clippy`, or `test`. |
| `codePulse.runOnSave` | `true` | Rebuild automatically when a Rust file is saved. |
| `codePulse.revealTerminalOnFailure` | `true` | Open the output terminal when something fails. |
| `codePulse.cargoPath` | `cargo` | Path to the cargo executable if it isn't on your PATH. |

## Commands

| Command | What it does |
| --- | --- |
| Code Pulse: Build / Restart | Start or restart the current command (also the status bar click action). |
| Code Pulse: Stop | Stop the running build or server and reset to idle. |
| Code Pulse: Show Output Terminal | Reveal the "Code Pulse" terminal. |
| Code Pulse: Select Command | Pick check, run, clippy, or test from a quick pick and rebuild. |

## Getting started

```bash
git clone https://github.com/mustafa-ans/code-pulse-server-status
cd code-pulse-server-status
npm install
npm run compile
```

Press F5 to launch the Extension Development Host, open a Cargo project, and save a `.rs` file. The icon comes to life on the left of the status bar.

## Testing

```bash
npm test
```

This compiles, lints, then runs the Mocha suite inside a throwaway VS Code instance. The cargo parser is covered by `src/test/suite/parser.test.ts`.

## Project layout

| File | Responsibility |
| --- | --- |
| `src/cargo.ts` | Parsing cargo's JSON message stream (pure, unit tested). |
| `src/terminal.ts` | The reusable pseudo-terminal. |
| `src/statusBar.ts` | Rendering the status bar icon and tooltip. |
| `src/extension.ts` | Wiring: activation, the save watcher, and process control. |

## Roadmap

- An inline error and warning badge on the icon.
- Push cargo diagnostics into the Problems panel for in-editor squiggles.
- Configurable debounce.

## License

MIT. Free to use, modify, and share.
