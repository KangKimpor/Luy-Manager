const TTL = 15_000;
const MAX_USERS = 100;
const cache = new Map<string, { expires: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

/** Only wallet metadata/preferences belong here. Identity, mode, amounts and writes stay fresh. */
export async function readMenuMetadata<T>(userId: string, part: string, load: () => PromiseLike<T>, fresh = false): Promise<T> {
  const key = `${userId}:${part}`;
  const cached = cache.get(key);
  if (!fresh && cached && cached.expires > Date.now()) return structuredClone(cached.value) as T;
  const running = inFlight.get(key);
  if (!fresh && running) return structuredClone(await running) as T;
  const pending = Promise.resolve(load()).then((value) => {
    if (inFlight.get(key) !== pending) return value;
    cache.delete(key);
    cache.set(key, { expires: Date.now() + TTL, value: structuredClone(value) });
    while (cache.size > MAX_USERS * 2) cache.delete(cache.keys().next().value!);
    return value;
  }).finally(() => { if (inFlight.get(key) === pending) inFlight.delete(key); });
  inFlight.set(key, pending);
  return structuredClone(await pending);
}

export function clearMenuMetadata(userId?: string): void {
  for (const key of cache.keys()) if (!userId || key.startsWith(`${userId}:`)) cache.delete(key);
  for (const key of inFlight.keys()) if (!userId || key.startsWith(`${userId}:`)) inFlight.delete(key);
}
