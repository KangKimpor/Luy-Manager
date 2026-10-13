export interface ActivityParams { view?: string; month?: string; day?: string; account?: string; category?: string; type?: string; q?: string; deleted?: string }

/** Keep navigation and filtering linkable, without carrying arbitrary query keys. */
export function activityHref(params: ActivityParams, patch: ActivityParams = {}) {
  const values = { ...params, ...patch };
  if (patch.month && patch.month !== params.month) values.day = undefined;
  const query = new URLSearchParams();
  for (const key of ["view", "month", "day", "account", "category", "type", "q", "deleted"] as const) {
    if (values[key]) query.set(key, values[key]);
  }
  return `/transactions?${query}`;
}
