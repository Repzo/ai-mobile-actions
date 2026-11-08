import { CATALOG } from "./generated/catalog.js";
import type { ActionName, ActionParams } from "./generated/types.js";
import type {
  ActionRequest,
  ActionSummary,
  MobileActionDefinition,
  MobileActionsCatalog,
} from "./types.js";

export * from "./types.js";
export type * from "./generated/types.js";
export * from "./text-transport.js";

/** The whole contract: guidance, transport and every action. */
export const catalog: MobileActionsCatalog = CATALOG;

/** The contract version (the package version). */
export const CONTRACT_VERSION: string = CATALOG.version;

export const ACTION_STATUSES = ["success", "failed", "cancelled"] as const;

export interface ActionFilter {
  /**
   * The contract version the app implements: actions introduced after it are left out.
   * Omit it to get every action.
   */
  version?: string;
  /** Include deprecated actions (left out by default). */
  includeDeprecated?: boolean;
}

const VERSION = /^\d+\.\d+\.\d+$/;

/** -1, 0 or 1, comparing two x.y.z versions. */
const compareVersions = (a: string, b: string): number => {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
};

const isOffered = (action: MobileActionDefinition, filter: ActionFilter): boolean => {
  if (filter.version !== undefined) {
    if (!VERSION.test(filter.version)) {
      throw new TypeError(`version must look like 1.2.3, got '${filter.version}'`);
    }
    if (compareVersions(action.since, filter.version) > 0) return false;
  }
  return filter.includeDeprecated === true || !action.deprecated;
};

/** The actions an app can run, one line each — the short list the assistant starts from. */
export function listActions(filter: ActionFilter = {}): ActionSummary[] {
  return CATALOG.actions
    .filter((action) => isOffered(action, filter))
    .map(({ name, title, summary }) => ({ name, title, summary }));
}

/**
 * One action's full definition — what the assistant reads before using it. Undefined for an
 * unknown name, or an action the app can't run under `filter`.
 */
export function getAction(
  name: string,
  filter: ActionFilter = {},
): MobileActionDefinition | undefined {
  const action = CATALOG.actions.find((item) => item.name === name);
  return action && isOffered(action, filter) ? action : undefined;
}

/** Whether `name` is one of the catalog's actions. */
export function isActionName(name: unknown): name is ActionName {
  return typeof name === "string" && CATALOG.actions.some((action) => action.name === name);
}

/** A typed action request (TypeScript checks `params` against the action). */
export function actionRequest<N extends ActionName>(
  action: N,
  params: ActionParams[N],
  summary: string,
): ActionRequest<ActionParams[N]> {
  return { action, params, summary };
}
