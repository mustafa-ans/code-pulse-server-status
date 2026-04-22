# code-pulse-server-status

## Deprecated

This project is deprecated and is no longer useful in practice because [`cargo-watch`](https://crates.io/crates/cargo-watch) is itself deprecated.

This extension was built on top of `cargo-watch` to read console output and infer build queue events that could update a VS Code status bar icon. The goal was simple: help the user see when Rust code had compiled (or failed) so they could decide whether to proceed with testing.

It was always a toy project.

## Recommended Alternative

Please use [`bacon`](https://github.com/canop/bacon) instead. It is the better tool for this workflow and provides a more capable experience than this extension.

## License and Reuse

Any code in this repository is free for use.
