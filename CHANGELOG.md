# Changelog

## 0.3.0 — 2026-11-03

Twelve new actions, all `since: 0.3.0` — offered only to app builds that implement them.

- Visit and day: `end_visit`, `start_day`, `end_day` — each runs the app's own checks (calls,
  required jobs, geofence, sync-first rules, time windows) and reports the outcome.
- On the phone: `navigate_to_client` (maps directions), `call_client` (dialer), `sync_data`
  (send what was recorded offline and report sent / pending / failed).
- Prepared for the rep to submit: `record_payment`, `add_client` (pinned at the phone's GPS
  position), `build_transfer` (van load / unload), `create_work_order` (CMMS work order or
  request).
- Requests: `skip_visit` (route-sequence skip, approved by an admin), `schedule_visit` (today's
  journey or a date).

## 0.2.0 — 2026-10-29

- `open_activity`: new optional `prefill` — answers placed before the screen opens (a form with
  `form_name`, a note, a new reminder); the card previews them and the rep confirms.
- `build_order`: new optional `return_reason` for returns, matched against the company's return
  reasons; when it's missing or matches none, the card asks the rep.
- `start_visit`: `not_started` now carries the reason the app showed the rep in `error`.
- `start_visit`: with no client named, send `nearest: true` instead of asking.
- `request_input`: an untouched yes/no answer is left out instead of coming back `false`;
  required fields block sending.
- `build_order`: `requested_qty` and `product_ambiguous` confirmed.
- `open_activity`: which activities open without a visit, and which need one.

## 0.1.0 — 2026-10-28

- The first version of the contract: the five actions the mobile app's assistant runs today —
  `start_visit`, `open_screen`, `open_activity`, `build_order` and `request_input` — with their
  parameters, results, failure codes and examples; the rules that apply to every action; and the
  text transport (a ` ```repzo-action ` block out, an `[action-result]` message back).
- Failure codes, result shapes and matching rules as the app team confirmed them: every
  start_visit and build_order failure (including those "Start visit & build" brings),
  partial build_order successes, request_input answers and date format, and the card-only
  failures of open_screen and open_activity. A cancelled result never carries data.
