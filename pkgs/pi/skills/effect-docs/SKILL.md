---
name: effect-docs
description: Fetch Effect-TS documentation when working with Effect-TS code, schemas, services, or patterns.
version: 0.1.0
---

When working with Effect-TS code or when the user asks about Effect-TS patterns, automatically fetch documentation from the Effect website.

1. Fetch `https://effect.website/llms.txt` to discover available documentation pages
2. Based on the topic at hand, fetch the relevant documentation URL(s)
3. Use the fetched documentation to inform your responses

Common documentation needs:
- **Schema**: validation, encoding/decoding, transformations
- **Effect**: core effect types, error handling, dependency injection
- **Stream**: streaming data processing
- **Layer**: service composition and dependency management
- **Runtime**: running effects, providing layers

Always prefer fetching current documentation over relying on training data, as the Effect-TS API evolves rapidly.
