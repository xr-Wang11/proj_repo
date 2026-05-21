# Variable Naming Rules

This document fixes the first-stage naming rule for user-defined variables.

## Rule Set

1. Variable names must start with a lowercase letter: `a` to `z`.
2. The remaining characters may only use lowercase letters, digits, or underscores.
3. The maximum length is 32 characters.
4. Leading or trailing spaces are not allowed.
5. A name cannot end with an underscore.
6. Consecutive underscores are not allowed.
7. Reserved names cannot be reused.

## Reserved Names

Reserved constants:

- `pi`
- `e`
- `i`

Reserved angle-unit names:

- `deg`
- `rad`

Reserved builtin function names:

- `sin`
- `cos`
- `tan`
- `sqrt`
- `exp`
- `log`
- `abs`
- `arg`
- `re`
- `im`
- `conj`
- `rect`
- `polar`
- `to_rect`
- `to_polar`

Reserved future session names:

- `ans`
- `history`

## Valid Examples

- `x`
- `voltage`
- `phase_a`
- `z1`
- `current_rms`

## Invalid Examples

- `1x`
- `_x`
- `PhaseA`
- `phase-a`
- `phase__a`
- `phase_`
- `pi`
- `sin`

## Why This Rule Set

The rule is intentionally strict:

- it keeps the tokenizer simple
- it avoids clashes with builtin constants and functions
- it keeps user-defined identifiers readable in CLI and future HTML UI
- it leaves room for later adding user-defined functions without changing the naming model
