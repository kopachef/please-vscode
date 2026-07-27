# VSCode extension for Please

This is the VSCode extension for the Please build system.

See https://please.build or https://github.com/thought-machine/please for more information about Please itself.

## Debugging

### Go language requirements

- Go
- [Delve](https://github.com/go-delve/delve)
- A Go document symbol provider, normally the VS Code Go extension with `gopls`

See the
[Go test symbol discovery decision](docs/decisions/go-test-symbol-discovery.md)
for why the extension uses VS Code document symbols instead of `go-outline`.

### Python language requirements

- Python 3
