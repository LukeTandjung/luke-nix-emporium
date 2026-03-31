---
name: figma-desktop
description: Work with Figma designs by connecting to the local Figma desktop MCP server for design-to-code workflows.
version: 0.1.0
---

When the user shares a Figma URL or asks about a Figma design, use the local Figma desktop MCP server at `http://127.0.0.1:3845/mcp` to retrieve design information.

## URL Parsing

Extract fileKey and nodeId from Figma URLs:
- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → convert "-" to ":" in nodeId
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` → use branchKey as fileKey

## Design-to-Code Workflow

1. **Get the design**: Retrieve design context including layout, colors, typography, and component structure
2. **Map components**: Figma frames have a one-to-one correspondence with BaseUI component tags. The frames are named accordingly.
3. **Map icons**: Icons are from HeroIcons or RadixIcons — use the fetch-icons-docs skill to find the correct React components.
4. **Reuse existing components**: Check if the project already has components that match the design before creating new ones.
5. **Adapt to the project**: Output should match the project's stack, components, and conventions.
