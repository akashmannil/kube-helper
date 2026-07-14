#!/usr/bin/env node
import { Command } from "commander";
// A static JSON import (not createRequire) so esbuild can inline the version
// when bundling for the single-file executable (commit 16).
import pkg from "../package.json" with { type: "json" };
import { registerApply } from "./commands/apply.js";
import { registerDelete } from "./commands/delete.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerExpose } from "./commands/expose.js";
import { registerLogs } from "./commands/logs.js";
import { registerScale } from "./commands/scale.js";
import { registerStatus } from "./commands/status.js";
import { registerValidate } from "./commands/validate.js";
import { registerWatch } from "./commands/watch.js";

const program = new Command();

program
  .name("kh")
  .description(
    "kube-helper — plug-and-play container orchestration for a single machine.\n" +
      "Declarative apps, replicas, scaling and logs on plain Docker — no cluster required."
  )
  .version(pkg.version, "-v, --version", "print the kh version")
  .showHelpAfterError();

registerApply(program);
registerDelete(program);
registerDoctor(program);
registerExpose(program);
registerLogs(program);
registerScale(program);
registerStatus(program);
registerValidate(program);
registerWatch(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
