# Changelog

## 0.1.0 — 2026-10-28

- The first version of the contract: the five actions the mobile app's assistant runs today —
  `start_visit`, `open_screen`, `open_activity`, `build_order` and `request_input` — with their
  parameters, results, failure codes and examples; the rules that apply to every action; and the
  text transport (a ` ```repzo-action ` block out, an `[action-result]` message back).
- Failure codes, result shapes and matching rules as the app team confirmed them: every
  start_visit and build_order failure (including those "Start visit & build" brings),
  partial build_order successes, request_input answers and date format, and the card-only
  failures of open_screen and open_activity. A cancelled result never carries data.
