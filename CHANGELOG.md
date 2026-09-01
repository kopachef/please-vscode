## Unreleased (TM Edition)

- Allow coverage targets to be filtered by top-level BUILD definition names.
- Respect integrated-terminal mode without forcing the Please Output channel
  to the front before a successful coverage run.
- Support BUILD rule parsing on Python versions where `ast.Str` is unavailable.

## 1.2.0 (January 21st, 2026)

- Fix resolution of Golang toolchain in debug configuration provider

## 1.1.1 (August 11th, 2022)

- Fallback to displaying the target onto the information box, because access to the clipboard will be from the context of the server when ssh'ing

## 1.1.0 (February 10th, 2022)

- Add codelens emoji above target definitions that copies the target label onto the clipboard

## 1.0.1 (January 24th, 2022)

- Prevent error pop up from being shown for language syntax errors while trying to place codelenses
- Fix issue where codelenses weren't being updated on text change
