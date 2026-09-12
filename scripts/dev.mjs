import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const children = new Set();
let stopping = false;

function launch(args) {
  const child = spawn(process.execPath, args, { cwd: root, env: process.env, stdio: ["inherit", "pipe", "pipe"] });
  children.add(child);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.once("exit", () => children.delete(child));
  return child;
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  await Promise.all([...children].map((child) => new Promise((resolve) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", () => { clearTimeout(timeout); resolve(); });
    child.kill("SIGTERM");
  })));
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

try {
  console.log("Building the document server…");
  const build = launch(["node_modules/typescript/bin/tsc", "--project", "tsconfig.server.json"]);
  await new Promise((resolve, reject) => {
    build.once("error", reject);
    build.once("exit", (code) => code === 0 ? resolve() : reject(new Error("The document server build failed.")));
  });
  if (!stopping) {
    console.log(`Starting the document server on port ${process.env.PORT || 3002}…`);
    const server = launch(["dist/server/index.js"]);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("The document server did not become ready within 30 seconds.")), 30000);
      let output = "";
      server.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("Server running at localhost:")) { clearTimeout(timeout); resolve(); }
      });
      server.once("error", (error) => { clearTimeout(timeout); reject(error); });
      server.once("exit", () => { clearTimeout(timeout); reject(new Error("The document server stopped before it was ready. See the error above.")); });
    });
    if (!stopping) {
      const frontend = launch(["node_modules/vite/bin/vite.js", ...process.argv.slice(2)]);
      for (const child of [server, frontend]) {
        child.once("error", (error) => { console.error(error.message); void stop(1); });
        child.once("exit", (code) => { if (!stopping) void stop(code ?? 1); });
      }
    }
  }
} catch (error) {
  if (!stopping) { console.error(error.message); await stop(1); }
}
