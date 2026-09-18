import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { isolatedBrowser } from "./stage-c-gates/browser.mjs";

const bundle = await build({ stdin: { contents: 'import * as checks from "./src/history/persistent-outbox.browser-check"; window.outboxChecks = checks;', resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", platform: "browser", target: "esnext" });
const server = createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/check.js" ? "text/javascript" : "text/html");
  response.end(request.url === "/check.js" ? bundle.outputFiles[0].text : '<!doctype html><script src="/check.js"></script>');
});
const browser = await isolatedBrowser();
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const page = await browser.launch(), url = `http://127.0.0.1:${server.address().port}`;
  await page.navigate(url);
  await page.evaluate('new Promise(resolve => { const timer = setInterval(() => { if (window.outboxChecks) { clearInterval(timer); resolve(); } }, 10); })');
  const recovery = await page.evaluate("outboxChecks.beforeReload()");
  // A new page context is essential: no in-memory outbox or pending packet survives.
  await page.evaluate("window.outboxOldContext = true");
  await page.navigate("about:blank");
  await page.navigate(url);
  await page.evaluate('new Promise(resolve => { const timer = setInterval(() => { if (window.outboxChecks) { clearInterval(timer); resolve(); } }, 10); })');
  assert.equal(await page.evaluate("window.outboxOldContext === undefined"), true);
  const result = await page.evaluate(`outboxChecks.afterReload(${JSON.stringify(recovery)})`);
  assert.equal(result.passed, true);
  console.log(JSON.stringify({ browser: page.version.product, ...result }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
