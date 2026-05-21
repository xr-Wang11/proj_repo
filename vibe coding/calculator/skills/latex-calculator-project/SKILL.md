---
name: latex-calculator-project
description: Continue development in this LaTeX calculator repository with project-specific architecture, feature history, UI constraints, and current Vue implementation context. Use when starting a new conversation on this repo, especially for calculator parsing/evaluation, equation solving, plotting, Vue UI work, build/debug tasks, or preserving prior project decisions without rediscovering the codebase.
---

# LaTeX Calculator Project

Use this skill when continuing work inside this repository after context has been lost across conversations.

## Quick Start

1. Read [`references/project-context.md`](references/project-context.md).
2. Treat `web-vue/` as the active frontend unless the user explicitly asks for legacy `web/`.
3. Keep the UI in Chinese unless the user asks otherwise.
4. Do not update `web/index.standalone.html` unless the user explicitly asks.
5. Run `npm.cmd run build` in `web-vue/` after substantial frontend changes.

## Working Rules

- Preserve existing user changes; do not revert unrelated edits.
- Prefer extending the current architecture over rewriting the core calculation layer.
- Keep solver, plotting, and display formatting concerns separated:
  - solving in `web-vue/src/solver/`
  - plotting in `web-vue/src/utils/equation-plot.js`
  - result formatting in `web-vue/src/utils/result-display.js`
  - UI panels in `web-vue/src/components/`
- When changing equation-mode behavior, check both:
  - `web-vue/src/composables/useEquationSystem.js`
  - `web-vue/src/App.vue`
- When changing plotting behavior, update both the model and the panel:
  - `web-vue/src/utils/equation-plot.js`
  - `web-vue/src/components/EquationPlotPanel.vue`

## Default Assumptions

- The active user-facing app is the Vue frontend in `web-vue/`.
- `core/` remains the shared calculation engine and should stay framework-agnostic.
- Build warnings about `calculator-runtime.js` not being a module are known and not necessarily blockers.
- The project favors practical iteration over large refactors.

## References

- Read [`references/project-context.md`](references/project-context.md) for the repo map, current feature set, known limitations, and common commands.
