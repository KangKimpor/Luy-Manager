import type { ActionResult } from "@/app/actions/transactions";

/** A lost response can follow a committed write, so never suggest a blind retry. */
export async function withActionFeedback<T>(
  action: () => Promise<ActionResult<T>>,
  message: string,
): Promise<ActionResult<T>> {
  try {
    return await action();
  } catch {
    return { ok: false, error: message };
  }
}
