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

  const endVisit = ajv.compile(getAction("end_visit").params);
  assert.equal(endVisit({}), true);
  assert.equal(endVisit({ client_name: "A" }), false, "end_visit always ends the open visit");

  const skipVisit = ajv.compile(getAction("skip_visit").params);
  assert.equal(skipVisit({ client_name: "A" }), false, "skip_visit needs a reason");
  assert.equal(skipVisit({ reason: "Closed" }), false, "skip_visit needs a client");
  assert.equal(skipVisit({ client_name: "A", reason: "Closed" }), true);

  const recordPayment = ajv.compile(getAction("record_payment").params);
  assert.equal(recordPayment({ amount: 0 }), false, "amount > 0");
  assert.equal(recordPayment({ amount: 10, method: "card" }), false, "cash or cheque only");

  const scheduleVisit = ajv.compile(getAction("schedule_visit").params);
  assert.equal(scheduleVisit({ client_name: "A", date: "15/01/2026" }), false, "dates are YYYY-MM-DD");

  const buildTransfer = ajv.compile(getAction("build_transfer").params);
  assert.equal(buildTransfer({ kind: "load", items: [{ product: "x", qty: 1 }] }), true);
  assert.equal(buildTransfer({ kind: "move", items: [{ product: "x", qty: 1 }] }), false);
});

test("actions newer than the app's contract version are never offered to it", () => {
  const added = ["end_visit", "start_day", "end_day", "navigate_to_client", "call_client", "sync_data",
    "record_payment", "add_client", "build_transfer", "skip_visit", "schedule_visit", "create_work_order"];
  const offered = (version) => listActions({ version }).map((action) => action.name);
  for (const name of added) {
    assert.ok(!offered("0.2.0").includes(name), `${name} is not offered to 0.2.0 apps`);
    assert.ok(offered("0.3.0").includes(name), `${name} is offered from 0.3.0`);
  }
});

test("the 0.5.0 actions are offered from 0.5.0 only", () => {
  const added = ["get_cart", "edit_cart", "clear_cart", "open_cart", "fill_form"];
  const offered = (version) => listActions({ version }).map((action) => action.name);
  for (const name of added) {
    assert.ok(!offered("0.4.0").includes(name), `${name} is not offered to 0.4.0 apps`);
    assert.ok(offered("0.5.0").includes(name), `${name} is offered from 0.5.0`);
    assert.equal(getAction(name, { version: "0.4.0" }), undefined);
  }
});

test("edit_cart: every entry changes something, and a removed line takes no new quantity", () => {
  const editCart = ajv.compile(getAction("edit_cart").params);
  assert.equal(editCart({ lines: [{ product: "Pepsi", qty: 3 }] }), true);
  assert.equal(editCart({ lines: [{ product: "Pepsi", unit: "carton" }] }), true);
  assert.equal(editCart({ lines: [{ product: "Pepsi", qty: 2, unit: "carton" }] }), true);
  assert.equal(editCart({ lines: [{ product: "Pepsi", remove: true }] }), true);
  assert.equal(editCart({ lines: [{ product: "Pepsi" }] }), false, "an entry that changes nothing");
  assert.equal(editCart({ lines: [{ product: "Pepsi", remove: true, qty: 3 }] }), false);
  assert.equal(editCart({ lines: [{ product: "Pepsi", remove: false }] }), false, "remove is only ever true");
  assert.equal(editCart({ lines: [{ product: "Pepsi", qty: 0 }] }), false, "qty > 0 — remove takes a line out");
  assert.equal(editCart({ lines: [] }), false, "at least one line");
  assert.equal(editCart({ kind: "transfer", lines: [{ product: "Pepsi", qty: 1 }] }), false);
});

test("the cart actions cover every document the cart can hold", () => {
  const kinds = getAction("build_order").params.properties.kind.enum;
  for (const name of ["edit_cart", "clear_cart", "open_cart"]) {
    assert.deepEqual(getAction(name).params.properties.kind.enum, kinds, name);
  }
  for (const name of ["get_cart", "edit_cart", "clear_cart"]) {
    assert.deepEqual(getAction(name).result.properties.kind.enum, kinds, name);
  }
  const clearCart = ajv.compile(getAction("clear_cart").params);
  assert.equal(clearCart({}), true);
  assert.equal(clearCart({ kind: "return_invoice" }), true);
});

test("fill_form: a named form and at least one typed answer; the result says what was placed", () => {
  const fillForm = ajv.compile(getAction("fill_form").params);
  const answer = (value) => ({ form_name: "Availability survey", answers: [{ question: "Available", value }] });
  for (const value of [true, 3, 0.35, "2026-01-15", "Sunquick Orange", ["A", "B"]]) {
    assert.equal(fillForm(answer(value)), true, JSON.stringify(value));
  }
  assert.equal(fillForm(answer({ amount: 1 })), false, "answers are plain values");
  assert.equal(fillForm(answer([])), false, "several picks means at least one");
  assert.equal(fillForm({ form_name: "Availability survey", answers: [] }), false, "at least one answer");
  assert.equal(fillForm({ answers: [{ question: "Available", value: true }] }), false, "the form is named");
  assert.equal(fillForm({ form_name: "F", answers: [{ value: true }] }), false, "each answer names its question");

  const action = getAction("fill_form");
  assert.equal(action.reports_result, true);
  const data = ajv.compile(action.result);
  const base = { form_name: "F", client_id: "1", client_name: "A" };
  assert.equal(data({ ...base, placed: [{ question: "Q", value: true }], not_placed: [] }), true);
  assert.equal(data({ ...base, placed: [], not_placed: [{ question: "Q" }] }), false, "a not-placed answer says why");
});

test("every action the guidance names is one of the catalog's actions", () => {
  const names = new Set(catalog.actions.map((action) => action.name));
  for (const rule of catalog.guidance) {
    for (const [word] of rule.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)) {
      assert.ok(names.has(word), `guidance names ${word}, which is not an action: ${rule}`);
    }
  }
});

test("get_cart only reads: no parameters, and a result for every document", () => {
  const action = getAction("get_cart");
  assert.equal(action.reports_result, true);
  assert.equal(ajv.compile(action.params)({}), true);
  assert.equal(ajv.compile(action.params)({ kind: "sales_order" }), false, "it reads whatever the cart holds");
  const data = ajv.compile(action.result);
  const base = { kind: "return_invoice", client_id: "1", client_name: "A" };
  assert.equal(data({ ...base, lines: [{ product: "P", qty: 1, unit: "Piece" }] }), true);
  assert.equal(data({ ...base, lines: [{ product: "P" }] }), false, "a line names its qty");
  assert.deepEqual(action.errors.map((error) => error.code), ["cart_empty", "error"]);
});

test("the jobs actions arrive with 0.4.0 and take no parameters", () => {
  const offered = (version) => listActions({ version }).map((action) => action.name);
  for (const name of ["get_jobs", "open_jobs"]) {
    assert.ok(!offered("0.3.0").includes(name), `${name} is not offered to 0.3.0 apps`);
    assert.ok(offered("0.4.0").includes(name), `${name} is offered from 0.4.0`);
    assert.equal(ajv.compile(getAction(name).params)({ client_name: "A" }), false, `${name} reads the open visit`);
  }
});

test("fill_retail_execution arrives with 0.6.0 and needs a template and answers", () => {
  const offered = (version) => listActions({ version }).map((action) => action.name);
  assert.ok(!offered("0.5.0").includes("fill_retail_execution"));
  assert.ok(offered("0.6.0").includes("fill_retail_execution"));
  const params = ajv.compile(getAction("fill_retail_execution").params);
  const answers = [{ question: "Price", value: 12 }];
  assert.equal(params({ template_name: "Shelf check", source: "Pepsi", answers }), true);
  assert.equal(params({ template_name: "Shelf check", answers }), false, "an item is required");
  assert.equal(params({ source: "Pepsi", answers }), false, "a template is required");
  assert.equal(params({ template_name: "Shelf check", answers: [] }), false, "at least one answer");
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
