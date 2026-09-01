#!/usr/bin/env node
import { D2 } from "@terrastruct/d2";
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
const source = readFileSync(input ?? 0, "utf8");
const d2 = new D2();
const result = await d2.compile(source);
const svg = await d2.render(result.diagram, result.renderOptions);

if (output) {
  writeFileSync(output, svg);
  console.error(`wrote ${output} (${svg.length} bytes)`);
} else {
  process.stdout.write(svg);
}

// The WASM package leaves worker handles open.
process.exit(0);
