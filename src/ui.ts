import { styleText } from "node:util";

export function ok(msg: string): void {
  console.log(`${styleText("green", "√")} ${msg}`);
}

export function fail(msg: string): void {
  console.log(`${styleText("red", "×")} ${msg}`);
}

export function info(msg: string): void {
  console.log(`${styleText("cyan", "•")} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${styleText("yellow", "!")} ${msg}`);
}

export function bold(s: string): string {
  return styleText("bold", s);
}

export function dim(s: string): string {
  return styleText("dim", s);
}

export function green(s: string): string {
  return styleText("green", s);
}

export function red(s: string): string {
  return styleText("red", s);
}

export function yellow(s: string): string {
  return styleText("yellow", s);
}

/** Length of a string as seen on screen, ignoring ANSI color codes. */
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;
function visibleLength(s: string): number {
  return s.replace(ANSI, "").length;
}

/** Render rows as left-aligned padded columns with a dimmed header, kubectl-style. */
export function table(headers: string[], rows: string[][]): string {
  const all = [headers, ...rows];
  const widths = headers.map((_, col) =>
    Math.max(...all.map((row) => visibleLength(row[col] ?? "")))
  );
  const render = (row: string[]): string =>
    row
      .map((cell, col) => {
        const c = cell ?? "";
        return c + " ".repeat((widths[col] ?? 0) - visibleLength(c));
      })
      .join("   ")
      .trimEnd();
  return [dim(render(headers)), ...rows.map(render)].join("\n");
}

/** Compact human age, e.g. 42s, 7m, 3h, 12d. */
export function age(unixSeconds: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
