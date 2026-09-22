---
name: framer-motion-craft
description: Professional guidance for modern micro-interactions, physics-based spring animations, gesture-driven interfaces, and shared-layout transitions in web apps.
---

# Framer Motion & Micro-Interactions Craft

Guide for building tactile, physical, delightful user interfaces using modern motion design principles and Framer Motion / CSS physics.

## Core Motion Principles

### 1. Spring Physics Over Linear Easing
- Real-world objects have mass and inertia. Prefer springs over duration-based Bézier curves (`ease-in-out` / linear) for interactive feedback.
- Recommended Spring Tokens:
  - **Snappy / Micro-tap**: `{ type: "spring", stiffness: 450, damping: 30 }` (buttons, toggles, badges)
  - **Smooth / Modal / Drawer**: `{ type: "spring", stiffness: 320, damping: 28 }` (canvas dialogs, modals, bottom sheets)
  - **Gentle / Card Hover**: `{ type: "spring", stiffness: 260, damping: 22 }` (team cards, player tiles)

### 2. Micro-Interactions on Interactive Nodes
- **Buttons & Chips**:
  - Hover: `whileHover={{ scale: 1.02, y: -1 }}` with subtle surface highlight or elevation.
  - Active / Tap: `whileTap={{ scale: 0.97 }}` provides tactile confirmation before routing or firing async actions.
- **Card Elements**:
  - Elevate subtle border brightness and drop shadow rather than drastically resizing cards.
- **Drag & Drop Nodes** (e.g. Tactical Pitch players, Tournament Bracket teams):
  - On drag start: `scale: 1.08`, increase z-index, add ambient drop shadow (`box-shadow: 0 16px 36px rgba(0,0,0,0.3)`).
  - Target slot: pulsating glow or dashed border pulse when hovered over (`animate={{ scale: 1.05 }}`).

### 3. Shared Layout Transitions (`layout` and `layoutId`)
- Use `layoutId` for sliding pill indicators behind active tabs (e.g., switching between `🏟️ Pitch View` and `🪑 Bench View`, or Table/Grid view).
- When filtering lists (e.g., filtering player pool by Position or Club), add `layout` prop to cards so items smoothly glide into their new grid coordinates instead of instantly snapping or flickering.

### 4. Orchestrated Page & Dialog Entrances
- **Modals & Overlays**:
  - Backdrop: Fade opacity from `0` to `1` (`duration: 0.18s`).
  - Dialog: Scale from `0.95` to `1.0` with subtle upward glide (`y: 8 -> 0`).
  - Exit: Fast exit (`duration: 0.12s`, `scale: 0.98`, `opacity: 0`).
- **Lists / Staggered Data**:
  - Avoid animating 50+ table rows. For hero or top 5 items, use gentle stagger (`staggerChildren: 0.04`).

### 5. Accessibility & Motion Restraint
- Always check `useReducedMotion()` from `framer-motion` or `@media (prefers-reduced-motion: reduce)`.
- When reduced motion is preferred, collapse springs to instant opacity fades or zero-duration transitions.
- Never animate non-GPU properties like `width`, `height`, `left`, `top` if `transform` (`x`, `y`, `scale`) can achieve the same effect.
