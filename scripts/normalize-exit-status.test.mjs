import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";

function runWithStatus(status) {
  return spawnSync(
    "sh",
    ["scripts/normalize-exit-status.sh", "sh", "-c", `exit ${status}`],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
}

test("preserves a successful process exit", () => {
  assert.equal(runWithStatus(0).status, 0);
});

test("normalizes the SIGTERM exit status used by Railway", () => {
  assert.equal(runWithStatus(143).status, 0);
});

test("preserves genuine process failures", () => {
  assert.equal(runWithStatus(42).status, 42);
});

test("forwards Railway SIGTERM and exits cleanly", async () => {
  const process = spawn(
    "sh",
    [
      "scripts/normalize-exit-status.sh",
      "sh",
      "-c",
      "trap 'exit 143' TERM; while :; do sleep 1; done",
    ],
    { cwd: new URL("..", import.meta.url) },
  );

  await new Promise((resolve) => setTimeout(resolve, 50));
  process.kill("SIGTERM");

  const [status] = await once(process, "exit");
  assert.equal(status, 0);
});
