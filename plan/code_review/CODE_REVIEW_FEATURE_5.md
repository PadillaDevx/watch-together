# Code Review — Feature 5: Client Integration of Free-for-All + Host Badge

**Scope reviewed**

- `apps/client/src/hooks/useSmartSync.ts` (JSDoc only, no behavior changes)
- `apps/client/src/hooks/__tests__/useSmartSync.test.ts` (new)
- `docs/client-playback-flow.md` (new)

**Test run**

`npx vitest run src/hooks/__tests__/useSmartSync.test.ts` → **1 file / 6 tests passed, 0 failed.**

**Overall verdict**

No regressions and the documentation accurately describes the existing implementation. The hook already implemented free-for-all (no `isHost` gate on `play`/`pause` emits) before this feature, so the JSDoc + tests + doc essentially formalize the contract. A few coverage gaps and one doc inaccuracy are worth addressing before locking the contract in.

---

## Findings

### Critical

_None._

### High

_None._

### Medium

#### M1 — `useSmartSync` does not handle a `seek` postMessage; doc implies it’s covered

`docs/client-playback-flow.md` (Free-for-all emit flow section) states:

> A manual seek surfaces through the iframe as a fresh `play` (or `pause`)
> postMessage with the new `currentTime`, so it follows the same emit path.

That is a provider-specific assumption. The current `useSmartSync` handler in [apps/client/src/hooks/useSmartSync.ts](apps/client/src/hooks/useSmartSync.ts#L85-L116) branches only on `type === 'timeupdate' | 'play' | 'pause'`. If a provider ever emits `type: 'seek'` (a plausible custom event name) it is silently dropped. Either:

- Add a `type === 'seek'` branch that emits `player-action` with `action: 'seek'`, **or**
- Tighten the doc wording to say explicitly that the client relies on the iframe re-emitting `play`/`pause` after a scrub, and that no `seek` postMessage type is observed.

Recommendation: tighten the doc (cheapest, matches today’s behavior) and leave a TODO referencing the assumption.

#### M2 — Test coverage gap: drift correction path on non-host

The most behavior-laden branch in the hook — non-host `timeupdate` → `silentSeek` with `DRIFT_IGNORE=2`, `DRIFT_SILENT=5`, 1 s spinner — is **completely uncovered**. The existing "non-hosts stay silent" assertion only checks `socket.emit` was not called; it does not assert that `silentSeek` runs.

Add at least:

- Non-host with `hostTimeRef` mocked via `onPlayerSync({ action: 'seek', currentTime: 100 })`, then dispatch `timeupdate` with `currentTime: 103` → expect `iframeRef.contentWindow.postMessage` called with `{ type: 'seek', value: 100, source: 'watchjunto' }`.
- Drift below `DRIFT_IGNORE` (e.g. 1 s) → no postMessage.
- Drift above `DRIFT_SILENT` (e.g. 7 s) → spinner callback registered via `registerSpinnerCallback` is invoked with `true` then `false` after 1 s (use `vi.useFakeTimers`).

This is the only logic that meaningfully changes between host and non-host; not covering it leaves a real regression vector.

#### M3 — Test coverage gap: `onPlayerSync` is the bridge between server and iframe and is untested

`onPlayerSync` (returned from the hook, wired by `SyncProvider` to the `player-sync` socket event) is what forwards server-broadcast actions into the iframe via `sendToPlayer`. It also updates `hostTimeRef` (the drift reference used by M2). Untested.

Add cases:

- `isHost: false`, call `onPlayerSync({ action: 'play', currentTime: 30 })` → expect `postMessage({ type: 'play', value: 30, source: 'watchjunto' }, '*')`.
- Same for `pause` / `seek`.
- `isHost: true`, call `onPlayerSync(...)` → expect **no** postMessage (host ignores its own echo).
- `enabled: false` → no postMessage.

#### M4 — Test coverage gap: host-only heartbeat (`getTime`, 15 s)

The `setInterval(... HEARTBEAT_INTERVAL)` effect at [apps/client/src/hooks/useSmartSync.ts](apps/client/src/hooks/useSmartSync.ts#L121-L131) is the mechanism that keeps drift reference broadcasts flowing during idle playback. Untested.

Add: with `vi.useFakeTimers`, render with `isHost: true`, advance 15 s, expect `postMessage({ type: 'getTime', source: 'watchjunto' }, '*')`. Render with `isHost: false`, advance 15 s, expect no `getTime` postMessage.

#### M5 — No test for host migration mid-playback

The doc’s "Host change mid-playback" section claims the role transition happens "on the next render" because `useEffect` deps include `isHost`. There is no test that re-renders with `isHost` toggled and asserts the broadcaster role actually switches. Given that this is the headline behavior of Feature 5, it should be locked in.

Add: `const { rerender } = renderHook(({ isHost }) => useSmartSync({ ..., isHost }), { initialProps: { isHost: false } })`. Dispatch `timeupdate` → no emit. `rerender({ isHost: true })`. Dispatch `timeupdate` → emit with `action: 'seek'`. `rerender({ isHost: false })`. Dispatch `timeupdate` → no emit again.

### Low

#### L1 — No-regression checklist uses unchecked task syntax inside doc

`docs/client-playback-flow.md` ends with a `## No-regression checklist` whose items are `- [ ]`. That syntax is fine for a runbook, but renders identically to a task list and may be mistaken (by humans or scripts that scan TASKS.md-style files) for unfinished Feature 5 work. Consider using bullets (`-`) and a separate "manual QA — perform once" header to disambiguate.

#### L2 — JSDoc references doc path that exists but with mixed conventions

The module-level JSDoc references `docs/playback-control-model.md`; the `.md` file does exist. No action needed, but the same hook JSDoc inlines the doc’s key claim (free-for-all). If the doc and the code ever diverge, the JSDoc will silently lie. Consider trimming the JSDoc to a one-liner pointer at the doc rather than a partial copy.

#### L3 — `onPlayerSync` is returned but `SyncProvider` wiring is out of scope here

The hook only works end-to-end if `SyncProvider` subscribes `socket.on('player-sync', onPlayerSync)`. That wiring is outside Feature 5’s diff and the test file. Worth confirming in Feature 6 (end-to-end verification) that the subscription/cleanup exists and survives `isHost` changes (since `onPlayerSync` is recreated when `isHost` flips).

---

## Recommendation

Approve Feature 5 with M1 (doc tightening) addressed. M2–M5 should be filed as follow-up test work — ideally rolled into Feature 6’s "Comprehensive verification" since they all relate to locking in the smart-sync free-for-all contract. L1–L3 are nits.
