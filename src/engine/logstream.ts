export type LogSource = "stdout" | "stderr";

export interface LogDemuxer {
  /** Feed raw bytes from a Docker log stream. */
  feed(chunk: Buffer): void;
  /** Emit any trailing partial line. Call once when the stream ends. */
  end(): void;
}

/**
 * Incremental parser for Docker's multiplexed log format.
 *
 * Containers created without a TTY (all kh containers) interleave stdout and
 * stderr in one stream of frames: an 8-byte header — stream type (1 byte),
 * 3 reserved bytes, payload length (UInt32BE) — followed by the payload.
 * Frames are split at arbitrary byte positions by the network, so both the
 * frame and its text can arrive in pieces; this demuxer buffers accordingly
 * and emits whole lines only.
 */
export function createLogDemuxer(onLine: (line: string, source: LogSource) => void): LogDemuxer {
  let buffer: Buffer = Buffer.alloc(0);
  const pending: Record<LogSource, string> = { stdout: "", stderr: "" };

  function emit(text: string, source: LogSource): void {
    pending[source] += text;
    let newline: number;
    while ((newline = pending[source].indexOf("\n")) >= 0) {
      onLine(pending[source].slice(0, newline).replace(/\r$/, ""), source);
      pending[source] = pending[source].slice(newline + 1);
    }
  }

  return {
    feed(chunk: Buffer): void {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
      while (buffer.length >= 8) {
        const size = buffer.readUInt32BE(4);
        if (buffer.length < 8 + size) break;
        const source: LogSource = buffer[0] === 2 ? "stderr" : "stdout";
        emit(buffer.subarray(8, 8 + size).toString("utf8"), source);
        buffer = buffer.subarray(8 + size);
      }
    },
    end(): void {
      for (const source of ["stdout", "stderr"] as const) {
        if (pending[source].length > 0) {
          onLine(pending[source], source);
          pending[source] = "";
        }
      }
    },
  };
}
