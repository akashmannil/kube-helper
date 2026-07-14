# Commit 7 — `kh logs`: one aggregated log stream per app

## What this commit delivers

`kh logs <app>` merges the logs of every replica into one stream, each line prefixed with its
replica's container name in a per-replica color:

```
$ kh logs demo --tail 3
[kh-demo-0] 172.17.0.1 - - [14/Jul/2026:07:20:39 +0000] "GET /from-replica-0 HTTP/1.1" 404 ...
[kh-demo-1] 172.17.0.1 - - [14/Jul/2026:07:20:39 +0000] "GET /from-replica-1 HTTP/1.1" 404 ...
```

Flags: `-f/--follow` (live stream, Ctrl+C to stop), `-n/--tail <lines>` (per replica),
`-t/--timestamps`.

## The interesting part: Docker's multiplexed log format

kh containers are created without a TTY, so the Engine interleaves stdout and stderr in a single
stream of **frames**: an 8-byte header — stream type (1 byte), 3 reserved bytes, payload length
(UInt32BE) — followed by the payload. Two complications make a naive implementation print
garbage:

1. TCP/pipe chunking splits frames anywhere — a header or its payload can arrive across chunk
   boundaries.
2. A payload is not a line — one frame can carry half a line or several.

`src/engine/logstream.ts` handles both with a small incremental demuxer: a byte buffer that
only consumes complete frames, feeding per-source (stdout/stderr) text buffers that only emit
complete lines. Trailing unterminated output is flushed when the stream ends. stderr lines are
rendered in red.

## Design decisions

- **Snapshot mode is sequential, follow mode is interleaved.** Without `--follow`, replicas are
  printed one after another in index order — deterministic and diff-friendly. With `--follow`,
  all replica streams run concurrently and lines appear in arrival order, which is what you
  want when watching an app live.
- **`--tail` is per replica**, mirroring `kubectl logs --tail` semantics; the default is each
  replica's full log (Docker's own default).
- **Exited replicas still show their logs** — often exactly what you need when debugging why
  one died. `listManaged` includes all states, so no special casing was required.
- **Colors by replica index, not container id**, so `kh-demo-0` keeps its color across
  replacements and restarts.

## Verification (live daemon)

- Snapshot: `kh logs demo --tail 3` printed the last 3 lines of each replica, prefixed and
  aligned with requests sent to 18080/18081 (`/from-replica-0` appears only under
  `[kh-demo-0]`, `/from-replica-1` only under `[kh-demo-1]` — proof the streams don't bleed).
- Follow: ran `kh logs demo -f --tail 0` in the background, sent one request per replica, and
  both appeared live in the output within the same second, correctly prefixed; nginx's error
  line (stderr frame type 2) and access line (stdout frame type 1) were both decoded.

## Next commit

Commit 8 completes the core lifecycle: `kh delete <app>` (and `kh delete --all`) for clean
teardown of everything kh manages.
