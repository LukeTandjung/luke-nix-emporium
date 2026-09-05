# autolith-document-mcp

A stdio MCP server for local document parsing with
[`@llamaindex/liteparse`](https://github.com/run-llama/liteparse).

It provides these tools:

- `document_parse`: extract bounded text or stable JSON.
- `document_search`: return bounded phrase hits with page coordinates.
- `document_screenshot`: render at most four pages as bounded PNG image blocks.

The server limits input to regular files below its workspace root. It resolves each
path inside the workspace, verifies the opened target, and parses a bounded private
snapshot. A later path change cannot redirect the parser.

```sh
AUTOLITH_WORKSPACE_ROOT="$PWD" autolith-document-mcp
```

LiteParse processes document content locally. The tool does not accept an OCR
server URL. Local OCR can download missing Tesseract language data.
