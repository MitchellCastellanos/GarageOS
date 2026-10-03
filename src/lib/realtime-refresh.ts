// Realtime = "something changed" signal; the authenticated client then refetches the authoritative data through a
// session-checked server action (privacy: no customer content travels through Pusher — see
// docs/compliance/privacy-impact-assessment.md, flow 7). A burst of signals must not stack parallel refetches.

/**
 * Wraps an async refresh so overlapping calls coalesce: while one run is in flight, any number of further calls
 * schedule exactly ONE more run afterwards (so the final state always reflects the newest signal, and there are
 * never two concurrent refreshes). Never throws; errors are passed to `onError`.
 */
export function coalescedRefresh(refresh: () => Promise<void>, onError: (err: unknown) => void = () => {}): () => Promise<void> {
  let running = false;
  let queued = false;
  return async function run() {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      do {
        queued = false;
        try {
          await refresh();
        } catch (err) {
          onError(err);
        }
      } while (queued);
    } finally {
      running = false;
    }
  };
}
