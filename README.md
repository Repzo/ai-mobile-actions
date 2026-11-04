# repzo-ai-mobile-actions

The contract between the Repzo AI chat and the Repzo mobile app: the **device actions** the
assistant may ask the phone to run — what each one does, its parameters, what comes back, and how
it can fail.

The app team owns the actions; this repository is where they are written down once. The AI chat
backend reads the same definitions to tell the assistant what the phone can do, so nothing about
the actions — or about the rep and their company — has to be hardcoded into a prompt.

## Install

```sh
npm install repzo-ai-mobile-actions
```

## How an action runs

1. The assistant decides an action fits what the rep asked and sends an **action request**:
   `{ action, params, summary }`.
2. The app shows it on an action card, with `summary` as its line. The rep confirms it and makes
   any choice the action needs (which nearby client, which of several matching products).
3. The app runs it with its own checks — GPS geofence, client verification, offline data.
4. When the action reports a result, the app sends an **action result** back:
   `{ ref, action, status, data?, error? }`. The assistant then tells the rep what happened.

The assistant works from a short list — one line per action — and reads an action's full
definition only when it needs it.

## Actions

<!-- actions:start -->
| Action | What it does | Reports a result | Since |
| --- | --- | --- | --- |
| [`add_client`](actions/add_client.yaml) | Open the Add client form filled in, located at the phone's current position, for the rep to submit. | no | 0.3.0 |
| [`build_order`](actions/build_order.yaml) | Prepare a sales order, return sales order, invoice or return invoice with the products the rep names — the phone fills the app's cart and opens it for the rep to review and submit. | yes | 0.1.0 |
| [`build_transfer`](actions/build_transfer.yaml) | Prepare a van load or unload with the products the rep names, for the rep to review and submit. | yes | 0.3.0 |
| [`call_client`](actions/call_client.yaml) | Dial a client's saved phone number from the phone, after the rep confirms. | no | 0.3.0 |
| [`clear_cart`](actions/clear_cart.yaml) | Empty the app's cart — drop the order, invoice or return being prepared, once the rep confirms. | yes | 0.4.0 |
| [`create_work_order`](actions/create_work_order.yaml) | Open a new work order or work request (CMMS) filled in, for the rep to submit. | no | 0.3.0 |
| [`edit_cart`](actions/edit_cart.yaml) | Change quantities or units of lines in the order, invoice or return being prepared in the app's cart, or remove lines — for the rep to review and submit. | yes | 0.4.0 |
| [`end_day`](actions/end_day.yaml) | End the rep's working day, with the app's own end-of-day checks. | yes | 0.3.0 |
| [`end_visit`](actions/end_visit.yaml) | End the rep's open visit, through the app's own end-of-visit checks. | yes | 0.3.0 |
| [`fill_form`](actions/fill_form.yaml) | Fill one of the app's forms with the answers the rep gives and open it filled, for the rep to review and submit. | yes | 0.4.0 |
| [`navigate_to_client`](actions/navigate_to_client.yaml) | Open turn-by-turn directions to one of the rep's clients in the phone's maps app. | no | 0.3.0 |
| [`open_activity`](actions/open_activity.yaml) | Open one of the app's activities for a client — forms, retail execution, store check, audit, notes, photos, orders, invoices, collection, CLM, history, media — for the rep to complete. | no | 0.1.0 |
| [`open_cart`](actions/open_cart.yaml) | Open the order, invoice or return being prepared in the app's cart, for the rep to review and submit. | no | 0.4.0 |
| [`open_jobs`](actions/open_jobs.yaml) | Open the jobs of the rep's open visit — the list, or one job by name — for the rep to do them. | no | 0.4.0 |
| [`open_screen`](actions/open_screen.yaml) | Open a screen of the mobile app — clients, calendar, tasks, reports, approvals, a client's profile, and more. | no | 0.1.0 |
| [`record_payment`](actions/record_payment.yaml) | Open a client's payment screen filled in with the amount, method and invoice, for the rep to submit. | no | 0.3.0 |
| [`request_input`](actions/request_input.yaml) | Ask the rep to fill a short form (text, numbers, dates, choices, yes/no) — use it when the rep tells you something to record or report. | yes | 0.1.0 |
| [`schedule_visit`](actions/schedule_visit.yaml) | Add a client to today's journey, or schedule a visit to them on a date. | yes | 0.3.0 |
| [`skip_visit`](actions/skip_visit.yaml) | Ask to skip a client on today's route, with the reason — an admin approves the skip. | yes | 0.3.0 |
| [`start_day`](actions/start_day.yaml) | Start the rep's working day, with the app's own start-of-day checks. | yes | 0.3.0 |
| [`start_visit`](actions/start_visit.yaml) | Start a visit at one of the rep's clients — by name, by id, or the nearest client by live GPS. | yes | 0.1.0 |
| [`sync_data`](actions/sync_data.yaml) | Send what the phone recorded offline (orders, visits, payments…) and say what is still waiting. | yes | 0.3.0 |
<!-- actions:end -->

Each file in [`actions/`](actions) holds the full definition: the instructions the assistant reads,
the JSON Schemas of `params` and of a successful result's `data`, the failure codes, and examples.

## The wire format today

The assistant ends its reply with one fenced block:

````
```repzo-action
{"action":"start_visit","params":{"nearest":true},"summary":"Start a visit at the nearest client"}
```
````

The app answers with a message:

```
[action-result] {"ref":"<assistant message id>:0","action":"start_visit","status":"success","data":{"client_id":"…","client_name":"…"}}
```

- `ref` — the assistant message's id and the block's index in it.
- `status` — `success`; `failed`, with `error` saying why and `data.code` naming the failure; or
  `cancelled`, when the rep declined the action.

[`schemas/`](schemas) holds the JSON Schemas of the request, the result and the phone state.

## The phone state

From contract 0.4.0 the app sends, with every chat request, what it knows right now: the rep's
day, the open visit with its jobs (pending, done or skipped), and the cart — the order, invoice or
return being prepared, line by line. It goes in `mobile_actions.state`, next to the version:

```json
{
  "mobile_actions": {
    "version": "0.4.0",
    "state": {
      "day": { "status": "active", "started_at": "2026-01-15T07:55:00.000Z" },
      "visit": {
        "client_id": "65f1a2b3c4d5e6f708192a01",
        "client_name": "Al Noor Market",
        "started_at": "2026-01-15T08:30:00.000Z",
        "jobs": [{ "name": "Availability survey", "type": "form", "required": true, "status": "pending" }]
      },
      "cart": null
    }
  }
}
```

- `day`, `visit` and `cart` are always sent; `visit` is `null` when no visit is open and `cart` is
  `null` when the cart is empty.
- The assistant reads it with that message only, as one line —
  `[phone-state] {"day":{…},"visit":{…},"cart":…}` — so it can answer "what are my jobs?" or
  "what's in my cart?" and fill the cart actions. The rep never sees it.
- It must match [`schemas/phone-state.schema.json`](schemas/phone-state.schema.json). A state that
  doesn't is dropped, and the message goes on without it.

The jobs and the cart live on the phone — a visit's jobs are worked out and ticked off there, and
synced later — so the server can't answer these questions itself.

## Using it

### Node / TypeScript

```ts
import {
  listActions,
  getAction,
  extractActionBlock,
  parseActionResultMessage,
  sendsPhoneState,
  formatPhoneStateMessage,
} from "repzo-ai-mobile-actions";

listActions({ version: "0.1.0" }); // [{ name, title, summary }, …] — what an app on contract 0.1.0 can run
getAction("build_order"); // the full definition: description, params, result, errors, examples

extractActionBlock(reply); // { request, text } — the action block at the end of an assistant reply
parseActionResultMessage(message); // the result in an "[action-result] …" message, or null

sendsPhoneState("0.4.0"); // true — that app sends mobile_actions.state
formatPhoneStateMessage(state); // "[phone-state] {…}" — the state as the assistant reads it
```

Types for every action's params and result come with it (`ActionParams["build_order"]`,
`ActionResultData["start_visit"]`, …), and `PhoneState` for the phone state.

### Any other platform

Read [`catalog.json`](catalog.json): the same contract as plain JSON — `guidance` (rules that apply
to every action), `phone_state` (from which version the app sends it, its schema and an example),
`transport`, and `actions[]`, each with draft-07 JSON Schemas for its params and result.

## Adding or changing an action

1. Add `actions/<name>.yaml` (copy an existing one), or edit one. Its first line points editors at
   [`schemas/action-definition.schema.json`](schemas/action-definition.schema.json), so they
   complete and check the file as you type.
   - `summary` — one line. It is all the assistant sees until it picks the action.
   - `description` — what the assistant needs to use it well. No personal or company data.
   - `params` and `result` — JSON Schema (draft-07). `{ $shared: client_name }` and the like pull
     in fragments from [`actions/_shared.yaml`](actions/_shared.yaml).
   - `errors` — every code the app reports in `data.code`.
   - `examples` — at least one, with made-up data. They are checked against the schemas.
   - `maintainer_notes` — open questions and app-side details. Never shown to the assistant.
2. Set `since` to the version that will ship it, and bump `version` in `package.json`.
3. Run `npm run generate` — it rebuilds `catalog.json`, the TypeScript types and the table above —
   then `npm test`, and commit everything.

Rules that apply to every action live in [`actions/_catalog.yaml`](actions/_catalog.yaml).

## Versions

The package version is the contract version.

- **Patch** — wording, descriptions, examples.
- **Minor** — a new action, a new optional parameter, a new error code, a new result field.
- **Major** — anything an app built on the previous version breaks on: a removed or renamed action
  or parameter, a new required parameter, a changed meaning. While the version is 0.x, a minor
  bump may carry these.

Each app build tells the backend which contract version it implements, and the assistant is only
offered actions whose `since` is not newer. Deprecate an action (`deprecated: "use … instead"`)
before removing it.

## Development

```sh
npm install
npm run generate   # actions/*.yaml → catalog.json, src/generated/*, the table above
npm test           # checks the actions and generated files, type-checks, builds, runs the tests
```

## License

Proprietary — © Repzo. All rights reserved. See [LICENSE](LICENSE).
