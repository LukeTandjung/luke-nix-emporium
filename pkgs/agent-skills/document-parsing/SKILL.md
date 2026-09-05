---
name: document-parsing
description: Parse, search, and inspect local PDF, Office, spreadsheet, and image documents. Use when a task needs text extraction, phrase coordinates, selected page images, layout inspection, or OCR from a workspace document.
---

# Document parsing

Use the local document MCP tools for bounded document work.

## Select the tool

- Use `document_search` first when the user gives a phrase or when you must locate a known term. It returns page numbers and bounding boxes.
- Use `document_parse` for text extraction. Request only the required page range. Use JSON only when coordinates or page structure matter.
- Use `document_screenshot` for layout, charts, tables, signatures, handwriting, or visual verification. Select at most four relevant pages per call.
- Use `paddle_ocr` when handwriting, formulas, tables, seals, or difficult page images need vision OCR. Use native document text as a baseline when it is available.

## Workflow

1. Confirm that the source is inside the current workspace.
2. Inspect metadata or search for a phrase before you parse a large document.
3. Keep page ranges and output formats as small as the task permits.
4. Save complete extracted output to a workspace file when the tool reports truncation. Do not treat a bounded preview as the complete document.
5. Compare extracted text with a screenshot when exact wording, reading order, or visual scope matters.
6. Report the source path, pages, extraction method, and any uncertain text.

## Limits

Do not infer missing text from context when exact transcription is required. The document tools accept only workspace-contained regular files and parse a private snapshot.