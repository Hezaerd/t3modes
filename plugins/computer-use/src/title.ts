import { exec } from "node:child_process";

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TITLE_TIMEOUT_MS = 3000;

export const parseThreadTitle = (stdout: string): string => {
  try {
    const title = (JSON.parse(stdout) as { thread?: { title?: unknown } } | null)?.thread?.title;
    return typeof title === "string" ? title.trim() : "";
  } catch {
    return "";
  }
};

/**
 * T3 Code gives the agents it runs their thread's id and its own CLI. Asking that CLI reaches the
 * T3 Code that runs this chat, sandbox or not. Agents outside T3 Code get "".
 */
export function threadTitle(env: NodeJS.ProcessEnv): Promise<string> {
  const id = env.T3CODE_THREAD_ID?.trim();
  const cli = env.T3CODE_CLI_PATH?.trim();
  if (!id || !cli || !THREAD_ID.test(id) || cli.includes('"')) return Promise.resolve("");
  // The CLI is a .cmd on Windows, which only a shell runs: hence a checked id and a quoted path.
  const command = `"${cli}" thread show ${id} --json --messages 0`;
  return new Promise((resolve) => {
    exec(command, { timeout: TITLE_TIMEOUT_MS, windowsHide: true, encoding: "utf8" }, (error, stdout) =>
      resolve(error ? "" : parseThreadTitle(stdout)),
    );
  });
}
