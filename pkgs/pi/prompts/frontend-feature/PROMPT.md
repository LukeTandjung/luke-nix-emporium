---
name: frontend-feature
description: Checklist for implementing a frontend feature. Ensures a Figma file is provided and all design-to-code conventions are followed.
---

# Frontend Feature Implementation

Before starting, verify:
- [ ] A Figma file/URL has been provided

## Design-to-Code Rules

1. **Component mapping**: There is a one-to-one correspondence between Figma frames and BaseUI component tags. The Figma frames are named accordingly.
2. **Icon mapping**: Icons in the Figma file are from HeroIcons or RadixIcons. Map them to their respective React library components using the fetch-icons-docs skill.
3. **Component reuse**: Reuse existing components whenever possible. If the Figma file has designs for a component that already exists in the project, check if it can be reused before creating a new one.
4. **Text hierarchy**: Do not nest text inside `<p>` tags unnecessarily.
   - Wrapping `<button>` text with `<p>` is unnecessary — use TailwindCSS classes on the parent.
   - For cards with header and description, use `<h1>` for the header and `<p>` for the description.

If no Figma file is provided, ask the user to provide one or clarify if this is a backend-only feature.
