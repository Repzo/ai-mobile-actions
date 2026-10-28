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
| [`build_order`](actions/build_order.yaml) | Prepare a sales order, return sales order, invoice or return invoice with the products the rep names — the phone fills the app's cart and opens it for the rep to review and submit. | yes | 0.1.0 |
| [`open_activity`](actions/open_activity.yaml) | Open one of the app's activities for a client — forms, retail execution, store check, audit, notes, photos, orders, invoices, collection, CLM, history, media — for the rep to complete. | no | 0.1.0 |
| [`open_screen`](actions/open_screen.yaml) | Open a screen of the mobile app — clients, calendar, tasks, reports, approvals, a client's profile, and more. | no | 0.1.0 |
| [`request_input`](actions/request_input.yaml) | Ask the rep to fill a short form (text, numbers, dates, choices, yes/no) — use it when the rep tells you something to record or report. | yes | 0.1.0 |
| [`start_visit`](actions/start_visit.yaml) | Start a visit at one of the rep's clients — by name, by id, or the nearest client by live GPS. | yes | 0.1.0 |
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

[`schemas/`](schemas) holds the JSON Schemas of the request and the result.

## Using it

### Node / TypeScript

```ts
import {
  listActions,
  getAction,
  extractActionBlock,
  parseActionResultMessage,
} from "repzo-ai-mobile-actions";

listActions({ version: "0.1.0" }); // [{ name, title, summary }, …] — what an app on contract 0.1.0 can run
getAction("build_order"); // the full definition: description, params, result, errors, examples

extractActionBlock(reply); // { request, text } — the action block at the end of an assistant reply
parseActionResultMessage(message); // the result in an "[action-result] …" message, or null
```

Types for every action's params and result come with it (`ActionParams["build_order"]`,
`ActionResultData["start_visit"]`, …).

### Any other platform

Read [`catalog.json`](catalog.json): the same contract as plain JSON — `guidance` (rules that apply
to every action), `transport`, and `actions[]`, each with draft-07 JSON Schemas for its params and
result.

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
