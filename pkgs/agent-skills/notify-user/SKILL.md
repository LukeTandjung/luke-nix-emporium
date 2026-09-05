---
name: notify-user
description: Send a native desktop notification from Autolith. Use when the user asks for a notification, or when the user asks to be notified after a long-running task or named milestone.
---

# Notify the user

Use the `notify_user` MCP tool only when the user requested a notification or a workflow explicitly requires one.

- Use a short title that names the task.
- State the completed milestone or the action that needs attention.
- Use normal priority by default.
- Use high priority only for a failure or a time-sensitive result.
- Send one notification for one milestone. Do not send repeated completion notices.
- If notification delivery fails, report the failure in the conversation. Do not claim delivery.

A notification does not replace the final response. Return the complete result in the conversation after the tool call.