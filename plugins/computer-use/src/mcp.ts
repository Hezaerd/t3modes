import { runRelay } from "./relay.ts";
import { threadTitle } from "./title.ts";

runRelay({
  home: process.env.T3MODE_HOME,
  supported: process.platform === "win32" && process.arch === "x64",
  title: () => threadTitle(process.env),
  stdin: process.stdin,
  stdout: process.stdout,
  exit: (code) => process.exit(code),
});
