# code-pulse-server-status

A small VS Code extension that monitors Rust build activity and updates the status bar based on `cargo watch` output.

## Project Status

> **Deprecated:** This project is no longer recommended for real-world use because it depends on [`cargo-watch`](https://crates.io/crates/cargo-watch), which has been deprecated.

This repository is kept as a small learning project and reference implementation for:
- building a VS Code extension,
- creating a status bar item,
- launching a child process from an extension,
- streaming terminal output through a pseudo-terminal,
- reacting to Rust build success and failure events.

## What It Does

When triggered from the VS Code status bar, the extension starts a `cargo watch -x run` process and listens to its output.

Based on the detected build state, it updates the status bar icon to indicate whether:
- compilation is in progress,
- the project compiled successfully,
- the build failed,
- or the watched process closed.

The goal was to give Rust developers a lightweight visual signal for build status without constantly checking terminal output.

## How It Works

The extension:
- adds a clickable status bar item in VS Code,
- starts a child process using `cargo watch -x run`,
- opens a VS Code pseudo-terminal to display command output,
- parses stdout and stderr for compilation-related patterns,
- updates the status bar text/icons depending on the inferred state.

## Why It Is Deprecated

This extension was built around `cargo-watch`, and that dependency is now deprecated. Because of that, this project is no longer a good practical choice for modern Rust workflows.

## Recommended Alternative

Use [`bacon`](https://github.com/canop/bacon) instead.

`bacon` provides a more capable and actively relevant workflow for watching Rust projects and reacting to build/test events.

## Running the Project

If you still want to explore the extension locally:

1. Clone the repository.
2. Install dependencies with `npm install` if required by the project setup.
3. Open the project in VS Code.
4. Press `F5` to launch the extension development host.
5. Open a Rust workspace and click the status bar item to start the watcher.

> Note: This only works in environments where `cargo watch` is installed and available in your PATH.

## Notes

This was always a small experimental project rather than a production-ready extension. Its value today is mainly educational: it shows how a VS Code extension can connect editor UI with external CLI tooling.

## Future Plans

This project is deprecated in its current form, but the idea behind it still has value.

A future rewrite could replace `cargo-watch` with a more stable and modern tool such as [`bacon`](https://github.com/canop/bacon), while keeping the same goal of surfacing Rust build status directly in the VS Code status bar.

That would allow the project to continue as:
- a useful developer productivity tool,
- a cleaner extension architecture,
- and a practical example of integrating Rust workflows with the VS Code extension API.

Until then, this repository serves as an educational prototype and reference implementation.

## License

Any code in this repository is free to use.