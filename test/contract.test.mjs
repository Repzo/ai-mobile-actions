// Runs against the built package (dist/) — what a consumer imports.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import {
  ACTION_BLOCK,
  ACTION_RESULT_PREFIX,
  CONTRACT_VERSION,
  catalog,
  extractActionBlock,
  formatActionBlock,
  formatActionResultMessage,
  getAction,
  isActionName,
  listActions,
  parseActionResultMessage,
} from "../dist/index.js";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const pkg = read("package.json");
const shipped = read("catalog.json");

const ajv = new Ajv({ strict: true, strictRequired: false, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addSchema(read("schemas/action-request.schema.json"));
ajv.addSchema(read("schemas/action-result.schema.json"));
const validateRequest = ajv.getSchema("action-request.schema.json");
const validateResult = ajv.getSchema("action-result.schema.json");

test("the shipped catalog is the one the code exports, at the package's version", () => {
  assert.deepEqual(catalog, shipped);
  assert.equal(CONTRACT_VERSION, pkg.version);
  assert.equal(catalog.name, pkg.name);
});

test("every action has its own file, a unique name and a one-line summary", () => {
  const files = readdirSync(new URL("../actions", import.meta.url))
    .filter((file) => file.endsWith(".yaml") && !file.startsWith("_"))
    .map((file) => file.replace(/\.yaml$/, ""))
    .sort();
  const names = catalog.actions.map((action) => action.name);
  assert.deepEqual([...names].sort(), files);
  assert.equal(new Set(names).size, names.length);
  for (const action of catalog.actions) {
    assert.doesNotMatch(action.summary, /\n/, `${action.name}: summary is one line`);
    assert.ok(!("maintainer_notes" in action), `${action.name}: maintainer notes stay out of the catalog`);
  }
});

test("every action's schemas compile, and its examples match them", () => {
  for (const action of catalog.actions) {
    const params = ajv.compile(action.params);
    const data = action.result ? ajv.compile(action.result) : undefined;
    assert.equal(action.reports_result, Boolean(action.result), `${action.name}: result iff reports_result`);
    const codes = new Set(action.errors.map((error) => error.code));
    for (const example of action.examples) {
      assert.ok(validateRequest(example.request), `${action.name}: ${ajv.errorsText(validateRequest.errors)}`);
      assert.ok(params(example.request.params), `${action.name}: ${ajv.errorsText(params.errors)}`);
      if (!example.result) continue;
      assert.ok(validateResult(example.result), `${action.name}: ${ajv.errorsText(validateResult.errors)}`);
      if (example.result.status === "success") assert.ok(data(example.result.data), action.name);
      if (example.result.status === "failed") assert.ok(codes.has(example.result.data.code), action.name);
    }
  }
});

test("the parameters reject what the app can't run", () => {
  const startVisit = ajv.compile(getAction("start_visit").params);
  assert.equal(startVisit({}), false, "start_visit needs a client name, an id or nearest");
  assert.equal(startVisit({ nearest: false }), false);
  assert.equal(startVisit({ client_name: "A", extra: 1 }), false, "no unknown parameters");

  const openScreen = ajv.compile(getAction("open_screen").params);
  assert.equal(openScreen({ screen: "client_profile" }), false, "client_profile needs client_name");
  assert.equal(openScreen({ screen: "calendar" }), true);

  const buildOrder = ajv.compile(getAction("build_order").params);
  assert.equal(buildOrder({ kind: "sales_order", items: [] }), false, "at least one item");
  assert.equal(buildOrder({ kind: "sales_order", items: [{ product: "x", qty: 0 }] }), false, "qty > 0");

  const requestInput = ajv.compile(getAction("request_input").params);
  const select = { key: "k", label: "K", type: "select" };
  assert.equal(requestInput({ title: "T", fields: [select] }), false, "a select field needs options");
  assert.equal(requestInput({ title: "T", fields: [{ ...select, options: ["a"] }] }), true);
});

test("the short list carries one line per action, filtered by the app's contract version", () => {
  const all = listActions();
  assert.equal(all.length, catalog.actions.length);
  for (const item of all) assert.deepEqual(Object.keys(item).sort(), ["name", "summary", "title"]);
  assert.deepEqual(listActions({ version: "0.0.1" }), []);
  assert.equal(listActions({ version: CONTRACT_VERSION }).length, catalog.actions.length);
  assert.throws(() => listActions({ version: "1.0" }), TypeError);
});

test("one action's full definition, on request", () => {
  const action = getAction("build_order");
  assert.equal(action.name, "build_order");
  assert.ok(action.description.length > action.summary.length);
  assert.ok(action.params && action.result && action.examples.length);
  assert.equal(getAction("no_such_action"), undefined);
  assert.equal(getAction("build_order", { version: "0.0.1" }), undefined, "too new for that app");
  assert.equal(isActionName("start_visit"), true);
  assert.equal(isActionName("drop_tables"), false);
});

test("text transport: an action block round-trips through a reply", () => {
  const request = {
    action: "start_visit",
    params: { nearest: true },
    summary: "Start a visit at the nearest client",
  };
  const block = formatActionBlock(request);
  assert.ok(block.startsWith(`\`\`\`${ACTION_BLOCK}\n`));
  const found = extractActionBlock(`Sure — pick the client on the card.\n${block}`);
  assert.deepEqual(found, { request, text: "Sure — pick the client on the card." });
});

test("text transport: the reply's last action block counts; a broken one is ignored", () => {
  const first = formatActionBlock({ action: "open_screen", params: { screen: "tasks" }, summary: "a" });
  const last = formatActionBlock({ action: "open_screen", params: { screen: "calendar" }, summary: "b" });
  assert.equal(extractActionBlock(`${first}\n${last}`).request.params.screen, "calendar");
  assert.equal(extractActionBlock("```repzo-action\n{not json}\n```"), null);
  assert.equal(extractActionBlock('```repzo-action\n{"action":"x"}\n```'), null, "not a request");
  assert.equal(extractActionBlock("```json\n{}\n```"), null, "another kind of block");
  assert.equal(extractActionBlock("No action here."), null);
});

test("text transport: the app's result message", () => {
  const result = {
    ref: "65f1a2b3c4d5e6f708192a3c:0",
    action: "start_visit",
    status: "failed",
    error: "The rep is outside the client's geofence; an approval request is needed.",
    data: { code: "out_of_geofence", approval_flow: "request_location_edit" },
  };
  const message = formatActionResultMessage(result);
  assert.ok(message.startsWith(`${ACTION_RESULT_PREFIX} `));
  assert.deepEqual(parseActionResultMessage(message), result);
  assert.ok(validateResult(result));
  assert.equal(parseActionResultMessage("Hello"), null);
  assert.equal(parseActionResultMessage(`${ACTION_RESULT_PREFIX} {oops`), null);
  assert.equal(
    parseActionResultMessage(`${ACTION_RESULT_PREFIX} {"ref":"r","action":"a","status":"done"}`),
    null,
    "an unknown status",
  );
});

test("the result envelope: a failure names its code, a cancellation carries nothing", () => {
  assert.equal(validateResult({ ref: "r", action: "a", status: "failed", error: "x" }), false);
  assert.equal(validateResult({ ref: "r", action: "a", status: "failed", error: "x", data: { code: "c" } }), true);
  assert.equal(validateResult({ ref: "r", action: "a", status: "cancelled" }), true);
  assert.equal(validateResult({ ref: "r", action: "a", status: "cancelled", data: {} }), false);
});

test("results as the app sends them", () => {
  const visit = ajv.compile(getAction("start_visit").result);
  assert.equal(visit({ client_id: "1", client_name: "A" }), false, "started_at is always sent");
  assert.equal(visit({ client_id: "1", client_name: "A", started_at: "2026-01-15T08:30:00Z" }), true);

  const order = ajv.compile(getAction("build_order").result);
  const base = { kind: "sales_order", client_id: "1", client_name: "A" };
  assert.equal(
    order({ ...base, added: [{ product: "P", qty: 2, requested_qty: 3 }], failed: [{ product: "Q", qty: 1, code: "out_of_stock" }] }),
    true,
    "a partial success lists its failed lines",
  );
  assert.equal(order({ ...base, added: [], failed: [{ product: "Q", code: "out_of_stock" }] }), false, "a failed line names its qty");

  const input = ajv.compile(getAction("request_input").result);
  assert.equal(input({ price: 0.35, seen_on: "2026-01-15", confirmed: false }), true);
  assert.equal(input({ price: { amount: 1 } }), false, "answers are plain values");
  assert.deepEqual(getAction("request_input").errors, [], "request_input never fails");
});

test("open_screen and open_activity report nothing; their failures only show on the card", () => {
  for (const name of ["open_screen", "open_activity"]) {
    const action = getAction(name);
    assert.equal(action.reports_result, false);
    assert.equal(action.result, undefined);
    assert.ok(action.errors.length > 0, `${name}: the card's failure codes are documented`);
    assert.match(action.description, /reports nothing back/);
  }
});

test("build_order lists the visit failures that \"Start visit & build\" can bring", () => {
  const orderCodes = new Set(getAction("build_order").errors.map((error) => error.code));
  const lookup = new Set(["client_not_found", "no_location", "no_nearby_client", "error"]);
  for (const { code } of getAction("start_visit").errors) {
    if (!lookup.has(code)) assert.ok(orderCodes.has(code), code);
  }
});
