// In-process per-key mutex. Serializes async read-modify-write sequences so
// concurrent requests to the file-backed stores don't clobber each other
// (last-write-wins data loss). A single Node process is assumed (the demo /
// standalone server); PRODUCTION uses a real DB whose engine provides
// serialization, so this module is only the bridge for the file store.
const chains = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  // Chain after any in-flight op for this key; swallow prior errors so one
  // failure doesn't poison the chain for subsequent callers.
  const run = prev.catch(() => undefined).then(() => fn());
  chains.set(
    key,
    run.catch(() => undefined)
  );
  // Best-effort cleanup so the map doesn't grow unbounded.
  run.finally(() => {
    if (chains.get(key) === undefined) chains.delete(key);
  }).catch(() => undefined);
  return run;
}
