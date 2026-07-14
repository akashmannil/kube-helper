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
