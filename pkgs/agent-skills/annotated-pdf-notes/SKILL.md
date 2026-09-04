---
name: annotated-pdf-notes
description: Extracts handwritten notes, highlights, tables, and figures from PDFs annotated on Luke T's DC1 tablet, then integrates them naturally into the relevant Typst or Markdown notes. Use when Luke imports an annotated PDF through KDE Connect or asks to merge handwritten/highlighted PDF annotations into existing notes while preserving the annotation text word for word.
compatibility: Requires Poppler utilities, ImageMagick, and the PaddleOCR-VL paddle_ocr tool. The target notes may require Typst or its native Markdown renderer for validation.
metadata:
  author: Luke T
---

# Annotated PDF Notes

Turn a flattened, annotated PDF into cleanly integrated notes. The source PDF may have been exported from a DC1 tablet through KDE Connect, so do not assume its highlights or handwriting exist as native PDF annotation objects.

The non-negotiable requirements are:

1. Preserve handwritten and highlighted text word for word.
2. Verify OCR against the rendered page; never silently repair, paraphrase, or invent handwriting.
3. Integrate material by topic into the existing notes. Never create headings such as “Annotations”, “Second-edition annotations”, “Imported notes”, or equivalent provenance-based sections.
4. Prefer a new semantic section only when no existing section fits.
5. Validate both source fidelity and the rendered notes before reporting completion.

## Establish the inputs

Identify:

- the annotated PDF;
- the notes project or files to update;
- the note format, structure, and build command;
- whether tables and figures should be transcribed, recreated, or embedded as images.

Infer these from the current project when they are clear. Ask Luke only when the source or destination is ambiguous. Never select “the newest PDF” when multiple exports are plausible. Record the exact selected path and its `sha256sum`, make an immutable working copy, and do not overwrite or modify the exported source PDF.

## Inspect the notes first

Before extracting annotations:

1. List the note files and inspect the main entry point.
2. Read the headings and enough surrounding content to understand where each topic belongs.
3. Identify formatting conventions for headings, quotations, definitions, tables, figures, diagrams, imports, and assets.
4. Find the actual validation command. For Typst projects, inspect local package imports and package paths rather than assuming that plain `typst compile main.typ` is sufficient.
5. Run the canonical build before editing to establish whether the project already has failures.

Build a mental topic-to-file map. The final organization must follow this map, not PDF page order.

## Render with Poppler

Use Poppler for dependable page rendering and native-text extraction:

```bash
pdfinfo <annotated.pdf>
pdftotext -layout <annotated.pdf> <work-dir>/native.txt
pdftoppm -png -r 180 <annotated.pdf> <work-dir>/page
```

Use a temporary work directory. Verify that the rendered image count matches `pdfinfo`, and account for rotated pages and CropBox differences. Increase to 300 DPI, then 600 DPI if needed, for difficult handwriting or tight crops.

If the PDF contains live annotations, render a second copy with `pdftoppm -hide-annotations` and compare it with the normal render to locate annotation regions. A zero difference means “flattened or absent”, not “no annotations”. For a flattened tablet export, the rendered page is authoritative.

For a long PDF, contact sheets may be used only to navigate. Pale highlights and small black ink can disappear when downsampled, so inspect every page at full resolution and record pages with no findings. Do not use a contact sheet as OCR input: combining pages reduces handwriting accuracy and can make OCR repeat or hallucinate text.

## Extract annotations with PaddleOCR-VL

Use Pi’s `paddle_ocr` tool configured for PaddleOCR-VL as the OCR engine. Do not silently substitute another OCR engine. Process marked pages individually and serially. Large multipage requests and parallel OCR calls are more likely to fail, hit rate limits, or corrupt reading order.

For each marked page:

1. Run page-level OCR only for discovery and context.
2. Visually inspect the full-resolution render.
3. Make a padded context crop and a tight crop for each handwritten note, highlighted passage, table, or figure. Preserve the original-color crops; enhanced images are secondary evidence only.
4. Run OCR on one annotation crop at a time. The crop result, checked against the image, is authoritative.
5. Use the specialized task when applicable:
   - `ocr` for prose and handwriting;
   - `table` for tables;
   - `formula` for equations;
   - `chart` for charts;
   - `spotting` when positions or reading order matter.

ImageMagick is suitable for non-destructive crops:

```bash
magick <page.png> -crop <width>x<height>+<x>+<y> +repage <crop.png>
```

If the OCR endpoint returns a rate-limit error, wait and retry serially. Do not switch to low-quality bulk OCR merely to finish faster.

## Separate printed text from added marks

Use the native text from `pdftotext` as the baseline:

- Handwriting usually appears only in the raster render and OCR output.
- Highlighted text is usually printed source text beneath a colored mark. Identify the exact highlighted start and end visually. Use `pdftotext -bbox-layout` when coordinates help, then copy the native wording only after checking it against the rendered glyphs. Broken character maps, ligatures, dehyphenation, columns, and reading order can make native PDF text wrong.
- Underlines, circles, arrows, brackets, and marginal symbols may indicate scope. Follow them when deciding which printed words belong to the annotation.
- A flattened export may contain no useful PDF annotation metadata. Absence of annotation objects does not mean there are no annotations.

Maintain a working ledger with:

- source path and hash;
- physical PDF page index and printed page label;
- bounding box, nearby anchor text, and any arrow/bracket/strike-through relationship;
- annotation type and color: handwriting, highlight, table, figure, formula, or structural mark;
- raw literal transcription;
- status: `verified`, `probable`, or `unresolved`;
- intended action, note file, and topic.

The ledger is working material, not a section to add to the notes.

## Preserve wording exactly

“Word for word” means:

- preserve spelling, capitalization, punctuation, abbreviations, emphasis, and bullet order;
- remove visual line wrapping only when it is clearly not intentional;
- do not correct grammar or terminology;
- do not turn shorthand into polished prose;
- do not replace a handwritten phrase with a summary;
- do not trust an implausible OCR result without checking the image.

For an uncertain reading:

1. rerender or crop at higher DPI;
2. OCR the tighter crop;
3. compare the handwriting with repeated letter forms elsewhere on the page;
4. inspect the nearby printed context;
5. if still uncertain, ask Luke and show the crop or give the smallest possible set of candidate readings.

Never choose a plausible word merely because it makes the sentence read better. Integrate only `verified` readings. If anything remains `probable` or `unresolved`, mark the run partial and ask Luke with the relevant crop before claiming completion.

## Integrate by subject, not provenance

Place each verified item beside the concept it explains:

- add an OLTP observation near the OLTP comparison;
- add an HTAP note near ETL or system architecture;
- add cloud notes within cloud hosting or cloud-native architecture;
- add definitions where that term is introduced;
- add a new topic heading only when the existing notes have no suitable home.

Do not organize the visible notes by import provenance. Do not append a catch-all annotation section or mention the source edition in a heading unless the edition itself is the topic. Keep page and source provenance in the working ledger, and retain citations when they are semantically part of the notes.

Preserve existing writing and structure. Avoid duplicating facts already present. Fuzzy similarity may flag a possible duplicate but must not discard it automatically. Skip an annotation only when its displayed wording and semantic role are genuinely duplicated, and record that decision in the ledger. When multiple destinations are equally plausible, ask Luke instead of choosing arbitrarily.

When the existing note paraphrases a newly highlighted passage, keep the existing note unless Luke explicitly asked to replace it verbatim; add only information that is genuinely missing. Minimal connecting text may be written to integrate an annotation, but the annotation itself must remain unchanged and must not be presented as Luke’s wording.

Keep the raw literal transcription in the ledger. Escape Typst or Markdown metacharacters only in the destination file, then verify that the rendered text still displays the literal wording.

Use the project’s established presentation style. Definitions and handwritten asides often fit existing quote/callout conventions; sequences should remain sequences; comparisons should remain tables when that improves fidelity.

## Tables, figures, and screenshots

When an annotation references a table or figure, do not replace the visual with a prose description.

Prefer recreation in Typst only when every cell, label, and relationship is unambiguous and the redraw is non-interpretive:

- use `paddle_ocr` with `task: table` to recover table cells;
- recreate simple diagrams with Typst primitives or the project’s diagram library;
- preserve labels, row order, column order, and caption wording;
- include citation markers shown in the source when they are part of the visual;
- visually compare the recreation with the source.

Prefer an exact screenshot crop when the visual is complex, when handwriting is part of the requested artifact, or when recreation would risk changing its meaning:

1. crop from a high-resolution Poppler render;
2. exclude unrelated body text while retaining the complete figure/table and requested marks;
3. save the asset under the project’s existing image directory and naming convention;
4. embed it using the project’s normal figure style;
5. preserve the source caption if one is present.

Use OCR to understand and verify a screenshot even when the final notes embed the image.

## Edit and validate

Before editing, group verified items by destination file so related changes are made together.

After editing:

1. search for accidental provenance headings such as “annotations” or “second edition”;
2. run whitespace and syntax checks;
3. compile the complete root note project with its real package path and build settings; for Markdown, use the repository’s native renderer or site generator;
4. locate the inserted content in the newly rendered output rather than relying on old page numbers, then render its page and adjacent pages with Poppler;
5. visually inspect tables, figures, line wrapping, column overflow, captions, asset resolution, broken headings, and section placement;
6. compare every inserted verbatim passage against the annotation ledger;
7. inspect the diff to ensure unrelated notes were not rewritten.

For Typst, a representative validation loop is:

```bash
typst compile --package-path <package-root> main.typ <work-dir>/notes.pdf
pdftoppm -png -r 150 -f <first-page> -l <last-page> <work-dir>/notes.pdf <work-dir>/review
```

Discover the correct package root from the project; do not hardcode one from another notes repository.

## Completion report

Report concisely:

- files and assets changed;
- topics into which annotations were integrated;
- tables or figures recreated or captured;
- validation performed;
- any words or marks that remain uncertain.

Do not claim word-for-word completion while unresolved readings remain. Ask Luke to resolve those readings first.
