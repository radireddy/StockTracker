# Rich Text Editor Polish — Design

**Date:** 2026-07-05
**Scope:** `src/components/ui/rich-text-editor-impl.tsx` (plus minor prose CSS in `globals.css` if needed)
**Goal:** Bring the Tiptap rich-text editor's UI/UX in line with the redesigned dashboard — polished, modern, brand-consistent. No changes to props, data model, or consuming components.

## Problems being fixed

- Native `<select>` font-size dropdown renders with raw OS styling and its menu overlaps the color picker popover.
- Toolbar active state uses generic grey (`bg-foreground/10`) instead of the brand accent used across the dashboard.
- Link and image insertion use raw `window.prompt()` browser dialogs.
- Editor surface uses `rounded-lg` and no shadow, out of step with dashboard cards/inputs (`rounded-xl`/`rounded-2xl` + `shadow-soft`).

## Design

### 1. Editor surface
- Container: `rounded-lg border-border/60` → `rounded-xl border shadow-soft`.
- Keep `focus-within:ring-2 focus-within:ring-ring/20`, tie border to brand on focus.
- Content padding → `px-3.5 py-2.5`.

### 2. Toolbar
- Sticky to top of editor (`sticky top-0 z-10`) with `bg-card/80 backdrop-blur`.
- Active state → brand: `bg-primary/10 text-primary`. Hover stays `hover:bg-muted`.
- Keep logical groups; dividers `bg-border/60`, `h-5`.

### 3. Font size (replace native select)
- Themed dropdown mirroring `TableMenu`/`ColorPicker`: trigger button shows current size (e.g. "16"), popover lists sizes with a checkmark on the active one. Click-outside + Escape to close. Removes native-OS look and the overlap.

### 4. Color picker
- `rounded-lg` popover + `shadow-soft`, small "Text color" label header, active swatch ring `ring-ring`, Clear row restyled as a footer button.

### 5. Link & image → themed popovers
- Link: inline popover anchored below the link button — URL input + Apply / Remove. Enter submits, Escape cancels.
- Image URL mode (no `companyId`): same popover instead of `prompt()`. File-upload mode (with `companyId`) unchanged.

### 6. Bubble menu
- On text selection, floating `rounded-full shadow-lift` pill with Bold, Italic, Underline, Strike, Highlight, Link. Uses `@tiptap/react/menus` (already available via `@tiptap/react` v3 — no new dependency).

### 7. Shared `ToolbarPopover` helper
- Single helper (trigger + click-outside + Escape) shared by font-size, color, table, and link popovers. Removes duplicated `useEffect`/`useRef` logic and unifies styling.

## Out of scope
- Editor extensions / data model, upload API, consuming components, other pages.

## Verification
- `npm run lint`, `npm run typecheck`, `npm run build` pass.
- Manual: font-size dropdown themed and no overlap; toolbar active states brand-colored; link/image popovers work; bubble menu appears on selection; light + dark mode both correct.
