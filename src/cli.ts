#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "node:module";
import { registerDoctor } from "./commands/doctor.js";
import { registerValidate } from "./commands/validate.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

program
  .name("kh")
  .description(
    "kube-helper — plug-and-play container orchestration for a single machine.\n" +
      "Declarative apps, replicas, scaling and logs on plain Docker — no cluster required."
  )
  .version(pkg.version, "-v, --version", "print the kh version")
  .showHelpAfterError();

registerDoctor(program);
registerValidate(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
