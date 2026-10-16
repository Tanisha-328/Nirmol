import { DIARY_VERSION, MAX_DIARY_ENTRIES, restoreDiaryEntry, type DiaryEntry } from "./exposure-diary";

export const DIARY_STORAGE_KEY = "nirmol.diary.v1";
export const MAX_DIARY_BYTES = 1_000_000;
export type DiaryStorageMode = "session" | "persistent";
export type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type DiaryLoad = { entries: DiaryEntry[]; mode: DiaryStorageMode; rejected: number; readOnly: boolean };
export class DiaryStorageError extends Error {
  constructor(readonly code: "conflict" | "invalid" | "locking") { super(`Diary storage ${code}`); }
}
// Contains no diary data; remembers this tab's explicit persistent selection.
const PERSISTENT_MARKER = JSON.stringify({ schemaVersion: DIARY_VERSION, mode: "persistent" });
type StorageResult<T> = T | Promise<T>;
export interface DiaryStorage {
  load(): StorageResult<DiaryLoad>;
  save(entries: readonly DiaryEntry[]): StorageResult<void>;
  setPersistence(enabled: boolean, entries: readonly DiaryEntry[], consent?: boolean): StorageResult<void>;
  clear(): StorageResult<void>;
  readonly mode: DiaryStorageMode;
}

/** Future authenticated adapter (NOT implemented): bind every operation to the
 * current auth.uid(), enforce owner-only SELECT/INSERT/UPDATE/DELETE with RLS,
 * and derive ownership on the server, never from an imported entry. Explicitly
 * ask before migrating any browser diary to an account. On sign-out/account
 * switch, cancel pending work and clear private in-memory state before loading
 * that user's rows. Export/delete must use the same authenticated owner scope.
 * No symptom/notes access for the advisor without a separate user action and
 * consent. Browser storage cannot guarantee confidentiality on shared devices.
 */
export class BrowserDiaryStorage implements DiaryStorage {
  mode: DiaryStorageMode = "session";
  private loaded = false;
  private blocked = false;
  private sessionSnapshot: string | null = null;
  private localSnapshot: string | null = null;
  constructor(private session: StoragePort, private local: StoragePort) {}

  private encode(entries: readonly DiaryEntry[], persistent: boolean): string {
    if (entries.length > MAX_DIARY_ENTRIES) throw new Error("Diary entry limit reached");
    const value = JSON.stringify({ schemaVersion: DIARY_VERSION, persistent,
      entries: entries.map((entry) => restoreDiaryEntry(entry)) });
    if (new TextEncoder().encode(value).byteLength > MAX_DIARY_BYTES) throw new Error("Diary storage size limit reached");
    return value;
  }
  private decode(value: string, persistent: boolean): { entries: DiaryEntry[]; rejected: number } {
    if (value.length > MAX_DIARY_BYTES || new TextEncoder().encode(value).byteLength > MAX_DIARY_BYTES) throw new Error("Diary storage size limit reached");
    const raw: unknown = JSON.parse(value);
    if (!raw || typeof raw !== "object") throw new Error("Invalid saved diary");
    const data = raw as Record<string, unknown>;
    if (data.schemaVersion !== DIARY_VERSION || data.persistent !== persistent || !Array.isArray(data.entries) || data.entries.length > MAX_DIARY_ENTRIES) throw new Error("Unsupported saved diary");
    const entries: DiaryEntry[] = [], ids = new Set<string>();
    let rejected = 0;
    for (const value of data.entries) {
      try {
        const entry = restoreDiaryEntry(value);
        if (ids.has(entry.id)) throw new Error("Duplicate entry");
        ids.add(entry.id); entries.push(entry);
      } catch { rejected++; }
    }
    return { entries, rejected };
  }
  load(): DiaryLoad {
    this.sessionSnapshot = this.session.getItem(DIARY_STORAGE_KEY);
    // An existing session diary always wins over a different browser diary.
    // Loading is read-only: do not erase unknown versions, rejected records,
    // or data whose dates only appear invalid because the clock moved back.
    let value = this.sessionSnapshot;
    this.mode = "session";
    if (value === null || value === PERSISTENT_MARKER) {
      this.localSnapshot = this.local.getItem(DIARY_STORAGE_KEY);
      value = this.localSnapshot;
      if (value !== null) this.mode = "persistent";
    }
    this.loaded = true; this.blocked = false;
    if (value === null) return { entries: [], rejected: 0, mode: this.mode, readOnly: false };
    try {
      const result = this.decode(value, this.mode === "persistent");
      this.blocked = result.rejected > 0;
      return { ...result, mode: this.mode, readOnly: this.blocked };
    } catch {
      this.blocked = true;
      return { entries: [], rejected: 1, mode: this.mode, readOnly: true };
    }
  }
  private ensureLoaded(): void { if (!this.loaded) this.load(); }
  private unchanged(storage: StoragePort, snapshot: string | null): void {
    if (storage.getItem(DIARY_STORAGE_KEY) !== snapshot) throw new DiaryStorageError("conflict");
  }
  private writable(): void {
    this.ensureLoaded();
    if (this.blocked) throw new DiaryStorageError("invalid");
  }
  save(entries: readonly DiaryEntry[]): void {
    this.writable();
    this.unchanged(this.session, this.sessionSnapshot);
    const persistent = this.mode === "persistent", value = this.encode(entries, persistent);
    const storage = persistent ? this.local : this.session, snapshot = persistent ? this.localSnapshot : this.sessionSnapshot;
    this.unchanged(storage, snapshot);
    if (value !== snapshot) storage.setItem(DIARY_STORAGE_KEY, value);
    if (persistent) this.localSnapshot = value; else this.sessionSnapshot = value;
  }
  setPersistence(enabled: boolean, entries: readonly DiaryEntry[], consent = false): void {
    this.writable();
    if (enabled && !consent) throw new Error("Explicit persistence consent required");
    if (enabled === (this.mode === "persistent")) return;
    this.unchanged(this.session, this.sessionSnapshot);
    if (enabled) {
      // Never replace another tab's or an earlier persistent diary implicitly.
      if (this.local.getItem(DIARY_STORAGE_KEY) !== null) throw new DiaryStorageError("conflict");
      const value = this.encode(entries, true);
      this.local.setItem(DIARY_STORAGE_KEY, value);
      try { this.session.setItem(DIARY_STORAGE_KEY, PERSISTENT_MARKER); }
      catch (error) {
        try { this.local.removeItem(DIARY_STORAGE_KEY); }
        catch { this.localSnapshot = value; this.mode = "persistent"; this.blocked = true; }
        throw error;
      }
      this.localSnapshot = value; this.sessionSnapshot = PERSISTENT_MARKER; this.mode = "persistent";
    } else {
      this.unchanged(this.local, this.localSnapshot);
      const value = this.encode(entries, false), previous = this.sessionSnapshot;
      // Validate and stage the destination BEFORE removing the only saved copy.
      this.session.setItem(DIARY_STORAGE_KEY, value);
      try { this.local.removeItem(DIARY_STORAGE_KEY); }
      catch (error) {
        try { if (previous === null) this.session.removeItem(DIARY_STORAGE_KEY); else this.session.setItem(DIARY_STORAGE_KEY, previous); }
        catch { this.sessionSnapshot = value; this.blocked = true; }
        throw error;
      }
      this.localSnapshot = null; this.sessionSnapshot = value; this.mode = "session";
    }
  }
  clear(): void {
    this.ensureLoaded();
    this.unchanged(this.session, this.sessionSnapshot);
    if (this.mode === "persistent") this.unchanged(this.local, this.localSnapshot);
    // Explicit deletion may clear rejected data; session-only deletion must
    // never touch a different diary in localStorage. Try both owned copies.
    let failure: unknown;
    if (this.mode === "persistent") {
      try { this.local.removeItem(DIARY_STORAGE_KEY); this.localSnapshot = null; } catch (error) { failure = error; }
    }
    try { this.session.removeItem(DIARY_STORAGE_KEY); this.sessionSnapshot = null; } catch (error) { failure = error; }
    if (failure) { this.blocked = true; throw failure; }
    // Empty metadata remembers session-only choice across reloads; no private
    // records are kept, and it cannot reveal an unrelated browser diary.
    const empty = this.encode([], false);
    this.session.setItem(DIARY_STORAGE_KEY, empty); this.sessionSnapshot = empty;
    this.mode = "session"; this.blocked = false;
  }
}

/** All browser read/modify/write sequences share an origin-wide Web Lock.
 * Snapshot checks reject stale drafts even after acquiring the lock. Without
 * Web Locks, session-only operation works, but persistent writes fail closed.
 */
export function createBrowserDiaryStorage(session: StoragePort, local: StoragePort, locks?: Pick<LockManager, "request">): DiaryStorage {
  const adapter = new BrowserDiaryStorage(session, local);
  const run = <T,>(operation: () => T, shared = false): Promise<T> => {
    if (locks) return locks.request(DIARY_STORAGE_KEY, operation);
    if (shared) return Promise.reject(new DiaryStorageError("locking"));
    return Promise.resolve().then(operation);
  };
  return {
    get mode() { return adapter.mode; },
    load: () => run(() => {
      const result = adapter.load();
      return !locks && result.mode === "persistent" ? { ...result, readOnly: true } : result;
    }),
    save: (entries) => run(() => adapter.save(entries), adapter.mode === "persistent"),
    setPersistence: (enabled, entries, consent) => run(() => adapter.setPersistence(enabled, entries, consent), enabled || adapter.mode === "persistent"),
    clear: () => run(() => adapter.clear(), adapter.mode === "persistent"),
  };
}
