---
name: fetch-llms-txt
description: Fetch llms.txt documentation when instructions or user requires working with specific libraries like BaseUI, Effect-TS, or Elysia-JS.
version: 0.1.0
---

When the user or project instructions require you to work with an external library (like BaseUI, Effect-TS, Elysia-JS), automatically:

1. Identify the official website for the mentioned library
2. Fetch the llms.txt file from `https://[framework-site]/llms.txt`
3. If llms.txt exists, summarize what documentation is available
4. Ask if they want you to fetch specific documentation URLs from the llms.txt

Examples:
- Instructions specify "we heavily make use of Base-UI and Effect-TS in the frontend" -> fetch https://base-ui.com/llms.txt and fetch https://effect.website/llms.txt
- Instructions specify "we heavily make use of Effect-TS and Elysia-JS in the backend" -> fetch https://effect.website/llms.txt and fetch https://elysiajs.com/llms.txt

If llms.txt doesn't exist or the framework website is unclear, inform the user and offer to search for documentation instead.
