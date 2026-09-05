import { spawn } from "node:child_process";

const priorities = new Set(["low", "normal", "high"]);
const urgency = { low: "low", normal: "normal", high: "critical" };
const maxMessageBytes = 4096;
const maxTitleBytes = 256;

export const appleScript = `on run argv
  set notificationMessage to item 1 of argv
  set notificationTitle to item 2 of argv
  display notification notificationMessage with title notificationTitle
end run`;

export function validateArguments(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("arguments must be an object");
  }

  const keys = Object.keys(input);
  const allowed = new Set(["message", "title", "priority"]);
  const extra = keys.find((key) => !allowed.has(key));
  if (extra !== undefined) throw new Error(`unknown argument: ${extra}`);

  if (typeof input.message !== "string" || input.message.trim().length === 0) {
    throw new Error("message must be a non-empty string");
  }
  if (Buffer.byteLength(input.message) > maxMessageBytes || input.message.includes("\0")) {
    throw new Error(`message must be at most ${maxMessageBytes} UTF-8 bytes and contain no NUL character`);
  }
  if (input.title !== undefined && (typeof input.title !== "string" || input.title.trim().length === 0)) {
    throw new Error("title must be a non-empty string");
  }
  const title = input.title ?? "Autolith";
  if (Buffer.byteLength(title) > maxTitleBytes || title.includes("\0")) {
    throw new Error(`title must be at most ${maxTitleBytes} UTF-8 bytes and contain no NUL character`);
  }
  if (input.priority !== undefined && !priorities.has(input.priority)) {
    throw new Error("priority must be one of: low, normal, high");
  }

  return {
    message: input.message,
    title,
    priority: input.priority ?? "normal",
  };
}

export function resolvePlatform(hostPlatform = process.platform) {
  if (hostPlatform === "linux") return "linux";
  if (hostPlatform === "darwin") return "macos";
  throw new Error(`native notifications are not supported on ${hostPlatform}`);
}

function commandFor(parameters, platform) {
  if (platform === "linux") {
    return {
      command: "notify-send",
      args: ["--app-name=Autolith", `--urgency=${urgency[parameters.priority]}`, "--", parameters.title, parameters.message],
    };
  }

  return {
    command: "osascript",
    args: ["-e", appleScript, "--", parameters.message, parameters.title],
  };
}

function run(command, args, { spawnImpl, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      signal,
    });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 8192) stderr += chunk.slice(0, 8192 - stderr.length);
    });
    child.once("error", reject);
    child.once("close", (code, closeSignal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed${code === null ? ` with signal ${closeSignal}` : ` with exit code ${code}`}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

export async function notifyUser(input, options = {}) {
  const parameters = validateArguments(input);
  const platform = resolvePlatform(options.hostPlatform);
  const invocation = commandFor(parameters, platform);
  await run(invocation.command, invocation.args, {
    spawnImpl: options.spawnImpl ?? spawn,
    signal: options.signal,
  });
  return {
    content: [{ type: "text", text: `Notification sent on ${platform}.` }],
  };
}
