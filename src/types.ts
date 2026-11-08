/** A JSON Schema (draft-07) as plain data. */
export type JsonSchema = { [key: string]: unknown };

export type ActionStatus = "success" | "failed" | "cancelled";

/** What the assistant asks the phone to run. */
export interface ActionRequest<Params = Record<string, unknown>> {
  /** The action's name, from the catalog. */
  action: string;
  /** The action's parameters; they match the action's `params` schema. */
  params: Params;
  /** One short line, in the rep's language, that the rep confirms on the action card. */
  summary: string;
}

/** What the phone reports back after running an action. */
export interface ActionResult<Data = Record<string, unknown>> {
  /** The action request this result answers. */
  ref: string;
  action: string;
  status: ActionStatus;
  /** On success, the action's result; on failure, at least `code`. */
  data?: Data;
  /** On failure, why — in plain words. */
  error?: string;
}

export interface ActionErrorDefinition {
  /** What the phone reports in `data.code`. */
  code: string;
  description: string;
  /** Extra fields the failure carries, as a JSON Schema `properties` map. */
  data?: Record<string, JsonSchema>;
}

export interface ActionExample {
  /** What the rep said. */
  says?: string;
  request: ActionRequest;
  result?: ActionResult;
}

/** One action, as the catalog describes it. */
export interface MobileActionDefinition {
  name: string;
  title: string;
  /** One line: what the action does and when to use it. */
  summary: string;
  /** Instructions for the assistant: when to use it, how to fill it, what comes back. */
  description: string;
  /** The contract version that introduced the action. */
  since: string;
  /** Set when the action should no longer be offered; says what to use instead. */
  deprecated?: string;
  /** false: the phone does not report a success (e.g. it only opens a screen). */
  reports_result: boolean;
  params: JsonSchema;
  /** `data` of a successful result; absent when the action reports none. */
  result?: JsonSchema;
  errors: ActionErrorDefinition[];
  examples: ActionExample[];
}

/** The wire format the app speaks today: a fenced block out, a prefixed message back. */
export interface TextTransport {
  /** The fenced block's info string (```repzo-action). */
  request_block: string;
  /** How the app's result message starts. */
  result_prefix: string;
  /** How to ask for an action, for the assistant. */
  instructions: string;
}

export interface MobileActionsCatalog {
  name: string;
  /** The contract version (the package version). */
  version: string;
  /** Rules that apply to every action, for the assistant. */
  guidance: string[];
  transport: { text: TextTransport };
  actions: MobileActionDefinition[];
}

/** One action in one line — what the assistant sees when it lists the actions. */
export interface ActionSummary {
  name: string;
  title: string;
  summary: string;
}
