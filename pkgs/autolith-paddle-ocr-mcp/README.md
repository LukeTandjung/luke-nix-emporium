# Autolith PaddleOCR MCP server

This package provides the `paddle_ocr` MCP tool over stdio. It sends image pages to a local OpenAI-compatible PaddleOCR-VL server. It uses `pdftoppm` to render PDF pages.

The server uses this endpoint by default:

```text
http://127.0.0.1:8080/v1
```

Set `PADDLE_OCR_URL` to use a different API base URL.

Run the server:

```sh
autolith-paddle-ocr-mcp
```

The tool accepts BMP, JPEG, PNG, WebP, and PDF files. It supports the `ocr`, `formula`, `table`, `chart`, `seal`, and `spotting` tasks. PDF requests process pages in order. OCR API requests also run in order.
