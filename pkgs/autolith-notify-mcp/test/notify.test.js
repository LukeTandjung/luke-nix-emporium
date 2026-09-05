import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { appleScript, notifyUser, resolvePlatform, validateArguments } from "../src/notify.js";
import { tool } from "../src/index.js";

function successfulSpawn(calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stderr.setEncoding = () => {};
    queueMicrotask(() => child.emit("close", 0, null));
    return child;
  };
}

test("tool schema describes a side-effecting notification", () => {
  assert.equal(tool.name, "notify_user");
  assert.deepEqual(tool.inputSchema.required, ["message"]);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.equal(tool.annotations.readOnlyHint, false);
  assert.equal(tool.annotations.idempotentHint, false);
});

test("validation applies defaults and rejects invalid arguments", () => {
  assert.deepEqual(validateArguments({ message: "Done" }), {
    message: "Done",
    title: "Autolith",
    priority: "normal",
  });
  assert.throws(() => validateArguments({}), /message/);
  assert.throws(() => validateArguments({ message: " " }), /message/);
  assert.throws(() => validateArguments({ message: "x", title: "" }), /title/);
  assert.throws(() => validateArguments({ message: "x", priority: "urgent" }), /priority/);
  assert.throws(() => validateArguments({ message: "x", platform: "linux" }), /unknown argument/);
  assert.throws(() => validateArguments({ message: "x".repeat(4097) }), /4096/);
  assert.throws(() => validateArguments({ message: "x", title: "t".repeat(257) }), /256/);
  assert.throws(() => validateArguments({ message: "x", extra: true }), /unknown argument/);
});

test("auto platform selects Linux and macOS", () => {
  assert.equal(resolvePlatform("linux"), "linux");
  assert.equal(resolvePlatform("darwin"), "macos");
  assert.throws(() => resolvePlatform("win32"), /not supported/);
});

test("Linux uses notify-send arguments without a shell", async () => {
  const calls = [];
  const message = 'complete; touch /tmp/injected $(echo bad) "quote"';
  const result = await notifyUser({
    message,
    title: "Build's status",
    priority: "high",
  }, { spawnImpl: successfulSpawn(calls), hostPlatform: "linux" });

  assert.deepEqual(result, { content: [{ type: "text", text: "Notification sent on linux." }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "notify-send");
  assert.deepEqual(calls[0].args, [
    "--app-name=Autolith",
    "--urgency=critical",
    "--",
    "Build's status",
    message,
  ]);
  assert.equal(calls[0].options.shell, false);
});

test("macOS passes untrusted text as argv to a fixed AppleScript", async () => {
  const calls = [];
  const message = 'say "owned" & do shell script "touch /tmp/injected"';
  const title = 'Title " & shell script';
  await notifyUser({ message, title, priority: "low" }, {
    spawnImpl: successfulSpawn(calls),
    hostPlatform: "darwin",
  });

  assert.equal(calls[0].command, "osascript");
  assert.deepEqual(calls[0].args, ["-e", appleScript, "--", message, title]);
  assert.equal(calls[0].options.shell, false);
  assert.doesNotMatch(appleScript, /owned|injected/);
});

test("native command failures include bounded stderr", async () => {
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stderr.setEncoding = () => {};
    queueMicrotask(() => {
      child.stderr.emit("data", "no notification service");
      child.emit("close", 1, null);
    });
    return child;
  };

  await assert.rejects(
    () => notifyUser({ message: "x" }, { spawnImpl, hostPlatform: "linux" }),
    /notify-send failed with exit code 1: no notification service/,
  );
});
