# VSCode extension for Please

This is the VSCode extension for the Please build system.

See https://please.build or https://github.com/thought-machine/please for more information about Please itself.

## Coverage

Open a supported Go or Python file and use the `plz cover` CodeLens to run
Please coverage for the associated test targets. The extension highlights
covered and uncovered lines, shows a coverage summary in the status bar, and
provides a visible `[clear]` CodeLens while coverage is displayed.

By default, the extension aggregates all eligible test targets. Use
**Please: Cover Current File with Target...** for a focused run.

See [Coverage](docs/coverage.md) for supported files, result semantics,
troubleshooting, and contributor information.

## Debugging

### Go language requirements

- Go
- [Delve](https://github.com/go-delve/delve)
- [Go Outline](https://github.com/ramya-rao-a/go-outline)

### Python language requirements

- Python 3
