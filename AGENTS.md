# Project working conventions

- Put major new features behind a feature flag, enabled by default unless the user's specification says otherwise. This applies to new features; do not change existing feature defaults without a request.
- If it is unclear whether a change is substantial enough to warrant a feature flag, ask the user before implementing it.
