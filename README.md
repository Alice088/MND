# MND — Infinite Space Knowledge System (ISKS)

Knowledge management system based on infinite nested spaces instead of filesystem.

## Tech Stack

- **Vite 8** + **React 19** + **TypeScript 6**
- Canvas 2D API (no external canvas lib)
- localStorage persistence

## Getting Started

```bash
npm run dev     # dev server with HMR
npm run build   # production build
npm run test    # run vitest suite
```

## How To Use

### Navigation

| Action | Input |
|--------|-------|
| Pan | Click empty space + drag |
| Zoom | Scroll wheel |
| Enter space | Double-click space object |
| Go back | Double-click empty area, or ← button, or `Esc` |
| Home | ⌂ button |

### Objects

| Object | Creation |
|--------|----------|
| Space | Right-click → Create → Space |
| Note | Right-click → Create → Note |
| File | Right-click → Create → File |
| Link | Right-click → Create → Link |
| Shape | Right-click → Create → Shape → Rectangle/Circle |

### Editing

| Action | How |
|--------|-----|
| Select | Click on object |
| Drag | Select + drag |
| Resize | Drag edge handles |
| Rename | Select → ✏ button in toolbar, or auto-opens for new spaces |
| Edit content | Select note/file → 📄 button in toolbar |
| Font size | Select → toolbar S/M/L/XL buttons |
| Delete | Select → `Delete` or `Backspace` key |

### Search

Press **Ctrl+K** (or **Cmd+K**) to open global search. Search across object names, note content, file content, URLs, and space names.

### Workspaces

Click **⊞** button (bottom-right) to manage workspaces. Create isolated areas for different projects.

## MVP Status

| Feature | Status |
|---------|--------|
| Infinite Canvas | ✅ |
| Nested Spaces | ✅ |
| Notes | ✅ |
| Files | ✅ (UI + content, no real file upload) |
| Links | ✅ |
| Shapes | ✅ |
| Search | ✅ (Ctrl+K) |
| Persistence | ✅ (localStorage auto-save) |
| Workspaces | ✅ |
| Delete | ✅ |
| Realtime Collaboration | 📋 planned |
| Relationships | 📋 planned |
| Permissions | 📋 planned |

## Project Structure

```
src/
  App.tsx           — layout, controls, keyboard shortcuts
  Canvas.tsx        — canvas renderer + interaction (drag/resize/zoom)
  ContextMenu.tsx   — right-click create menu
  SearchOverlay.tsx — Ctrl+K global search
  store.ts          — state management + localStorage persistence
  types.ts          — TypeScript types
  menuPosition.ts   — context menu positioning math
  App.css           — styles
  index.css         — reset
*/
