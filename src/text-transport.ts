import { CATALOG } from "./generated/catalog.js";
import type { ActionRequest, ActionResult, ActionStatus } from "./types.js";

/** The info string of the fenced block that asks the app to run an action. */
export const ACTION_BLOCK: string = CATALOG.transport.text.request_block;

/** How the app's result message starts. */
export const ACTION_RESULT_PREFIX: string = CATALOG.transport.text.result_prefix;

const STATUSES: readonly ActionStatus[] = ["success", "failed", "cancelled"];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRequest = (value: unknown): value is ActionRequest =>
  isObject(value) &&
  typeof value.action === "string" &&
  isObject(value.params) &&
  typeof value.summary === "string";

const isResult = (value: unknown): value is ActionResult =>
  isObject(value) &&
  typeof value.ref === "string" &&
  typeof value.action === "string" &&
  STATUSES.includes(value.status as ActionStatus) &&
  (value.data === undefined || isObject(value.data)) &&
  (value.error === undefined || typeof value.error === "string");

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The fenced block an assistant reply ends with to run an action. */
export function formatActionBlock(request: ActionRequest): string {
  return `\`\`\`${ACTION_BLOCK}\n${JSON.stringify(request)}\n\`\`\``;
}

/**
 * The action block in an assistant reply — the last one, as replies end with it — and the reply
 * without it. Null when there is none, or its body is not an action request.
 */
export function extractActionBlock(
  reply: string,
): { request: ActionRequest; text: string } | null {
  const pattern = new RegExp(
    `\`\`\`${escapeRegExp(ACTION_BLOCK)}[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n?\`\`\``,
    "g",
  );
  let last: RegExpExecArray | null = null;
  for (let match = pattern.exec(reply); match; match = pattern.exec(reply)) last = match;
  if (!last || last[1] === undefined) return null;
  let request: unknown;
  try {
    request = JSON.parse(last[1]);
  } catch {
    return null;
  }
  if (!isRequest(request)) return null;
  const text = (reply.slice(0, last.index) + reply.slice(last.index + last[0].length)).trim();
  return { request, text };
}

/** The message the app sends back with an action's outcome. */
export function formatActionResultMessage(result: ActionResult): string {
  return `${ACTION_RESULT_PREFIX} ${JSON.stringify(result)}`;
}

/** An action result read from the app's message; null when the message is not one. */
export function parseActionResultMessage(message: string): ActionResult | null {
  const text = message.trimStart();
  if (!text.startsWith(ACTION_RESULT_PREFIX)) return null;
  let result: unknown;
  try {
    result = JSON.parse(text.slice(ACTION_RESULT_PREFIX.length));
  } catch {
    return null;
  }
  return isResult(result) ? result : null;
}
