/** Same-origin page-memory signal only: no identity, token or private fields. */
export function notifyAuthChange() {
  try {
    const channel = new BroadcastChannel("nirmol.auth.v1");
    channel.postMessage("session-changed");
    channel.close();
  } catch { /* Focus/pageshow and server authorization remain the fallback. */ }
}
