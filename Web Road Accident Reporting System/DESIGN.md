---
name: Road Accident Reporting
description: A public road-accident reporting system whose official surfaces read as one dark command centre.
colors:
  surface-ground: "hsl(210 30% 6%)"
  surface-panel: "hsl(210 26% 9%)"
  surface-raised: "hsl(209 24% 13%)"
  surface-track: "hsl(209 22% 17%)"
  text-primary: "hsl(210 30% 94%)"
  text-secondary: "hsl(212 16% 72%)"
  text-tertiary: "hsl(213 15% 56%)"
  accent-authority: "hsl(216 94% 49%)"
  accent-authority-hover: "hsl(216 95% 58%)"
  accent-ink: "hsl(210 40% 99%)"
  accent-text: "hsl(216 96% 68%)"
  level-none: "hsl(160 84% 52%)"
  level-light: "hsl(172 66% 50%)"
  level-moderate: "hsl(43 96% 56%)"
  level-heavy: "hsl(27 96% 61%)"
  level-severe: "hsl(0 84% 60%)"
  level-violet: "hsl(258 90% 70%)"
typography:
  page-title:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  reading:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "1.55rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.14em"
  reference:
    fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  panel: "0.75rem"
  control: "0.5rem"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "1.75rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-authority}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.9rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-authority-hover}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.9rem"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.9rem"
  badge:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
    padding: "0.15rem 0.55rem"
  panel:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.panel}"
    padding: "0.875rem"
  field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.7rem"
---

# Design System: Road Accident Reporting

## Overview

**Creative North Star: "The Incident Console"**

The system is one instrument panel seen through frosted glass. Every official surface — the operations map, the admin analytics console, the reports and notifications tabs — is the same command centre at a different zoom, so an admin moving between them is panning one console rather than loading another product. Dark is the default state of that room; the light theme is the same room with the lamps on, not a second design.

Density is instrumental, never decorative. A reading is a large tabular number with a small caption under it; a panel answers exactly one question; colour is spent only where it carries meaning (the eight status hues, the severity ramp, the up/down of a year-over-year delta). Everything else is neutral surface, hairline, and text weight. Rank comes from scale, not from hue.

The material is frosted glass on a faint accent and violet glow: a translucent panel fill, a backdrop blur, a hairline border, and a single inset highlight along the top edge. Depth is entirely this stack — there is no skeuomorphic lift, and the glow is the only ornament the system allows itself.

**Key Characteristics:**
- One grammar for every official surface: situation line, title row, readings, then the work panel.
- Frosted translucent panels over a faint accent/violet glow; hairline borders and an inset top highlight in place of heavy shadows.
- Tabular figures and monospace report references; numbers are the content.
- The status and severity ramp is the only saturated colour; nothing else is tinted for decoration.
- Dark-first. The light theme is a variant of the same tokens, not a separate palette.

## Colors

A near-black blue-grey ground carries a single strong blue accent and a six-step severity ramp; every hue that is not a status or a severity is neutral.

### Primary
- **Authority Blue** (`hsl(216 94% 49%)`): the one interactive accent — primary buttons, the selected pipeline stage, focus rings, active nav, and the selection colour. `accent-text` (`hsl(216 96% 68%)`) is its readable-on-dark partner for links and selected labels; `accent-ink` (`hsl(210 40% 99%)`) is what sits on top of a solid accent fill.

### Secondary
- **Severity Ramp** (`none` `hsl(160 84% 52%)`, `light` `hsl(172 66% 50%)`, `moderate` `hsl(43 96% 56%)`, `heavy` `hsl(27 96% 61%)`, `severe` `hsl(0 84% 60%)`): the ordered accident-severity scale, and the source the report-status hues are drawn from. `violet` (`hsl(258 90% 70%)`) sits outside the ramp as the assigned-stage hue.

### Neutral
- **Ground** (`hsl(210 30% 6%)`): the page and shell behind every panel; also the base the ambient glow is painted on.
- **Panel** (`hsl(210 26% 9%)`): cards, modals, and panel fills. In the console it is applied translucent over the ground so the glow shows through the glass.
- **Raised** (`hsl(209 24% 13%)`): inputs, selects, secondary buttons, table headers, badges, and hover fills.
- **Track** (`hsl(209 22% 17%)`): the third step, used only for hover states on raised elements.
- **Text I / II / III** (`hsl(210 30% 94%)` / `hsl(212 16% 72%)` / `hsl(213 15% 56%)`): primary content, secondary content, and captions/labels/eyebrows respectively.
- **Line** (`hsl(210 20% 100%)`): a white base used only at low alpha, `0.09` for hairline dividers and `0.16` for meaningful edges.

### Named Rules
**The Meaning-Only Colour Rule.** A saturated hue appears only when it encodes something: a status, a severity, a delta direction, or the single interactive accent. Decorative tint is a defect.

**The Blend-Don't-Bleed Rule.** Text on a tinted fill is the hue blended 75% toward the theme's own text colour, never the raw hue. The raw severity hue only reaches about 4.2:1 against its own tint, which fails AA at badge and alert sizes.

## Typography

**Display Font:** Geist with the platform sans stack (`system-ui`, `-apple-system`, `Segoe UI`, `Roboto`, `Arial`) — the webfont is optional and the stack degrades cleanly.
**Body Font:** the same stack.
**Label/Mono Font:** the platform monospace stack (`ui-monospace`, `Cascadia Mono`, `Consolas`) for report references only.

**Character:** one neutral, unshowy sans carries the whole system at three weights and three sizes; the only expressive move is tabular figures at display scale. There is no display face, and none is wanted — the numbers are the display voice.

### Hierarchy
- **Page title** (600, `1.25rem`, `1.3`): one per page, in the header row beside its filters or actions.
- **Reading** (700, `1.55rem`, `1.15`, `-0.02em`): KPI and pipeline-stage figures, always with `font-variant-numeric: tabular-nums`.
- **Body** (400, `0.875rem`, `1.55`): prose, table cells, list rows, alert text.
- **Label** (600, `0.6875rem`, `0.14em`, uppercase): panel titles, table headers, field captions, and the situation strip's figures' captions.
- **Reference** (400, `0.75rem`, monospace): report references such as `RA-2026-000010`, set apart from prose on purpose.

### Named Rules
**The Numbers-Are-the-Voice Rule.** Emphasis is scale plus tabular figures, never a display face, gradient, or colour.

**The Measured-Mono Rule.** Monospace is reserved for identifiers and measurements — report references, coordinates, values that must align. It is not a costume for "technical".

## Layout

A `1200px` centred container with `1.75rem 1.25rem 3rem` padding holds the ordinary pages. The operations map opts out and takes the whole viewport (`max-width: none`, no padding) as a flex row of a fixed-width sidebar and the map.

Dense official surfaces compose on a CSS grid with named areas, not on a stack of equal cards. The admin console uses two columns (`1.5fr 1fr`) in this reading order: situation strip, header, readings, pipeline rail, then map beside charts, then the queue, then the counting-method footer. Gaps sit at `12–14px`, and panels keep an `8–12px` internal rhythm — tight groups inside a panel, generous separation between panels.

Below `900px` the console collapses to one column and the eight-stage rail becomes a horizontally scrolling row of fixed-width stages rather than eight squeezed columns. Below `820px` the map sidebar becomes a drawer over the map. Responsive type and container width stay otherwise untouched; tables scroll inside their panel rather than breaking the page.

## Elevation & Depth

Depth is one material, not a shadow vocabulary. A surface that floats gets three properties together or none of them: a translucent fill (`hsl(var(--surface-1) / 0.55–0.88)`), a backdrop blur (`blur(18–20px) saturate(150%)`), a hairline border (`hsl(var(--line) / var(--line-strong-alpha))`), and a single inset top highlight (`inset 0 1px 0 hsl(0 0% 100% / 0.06)`). A soft, large drop shadow (`0 16px 40px` at the theme's own shadow alpha) may accompany it; nothing else may.

The ambient glow behind the floating stack is two radial gradients over the ground — accent at `0.22` from the top-left, violet at `0.14` from the bottom-left. On the light theme both retreat (to `0.1` and `0.07`) and the glass turns nearly solid, because a strong wash reads as a stain on a light field.

### Named Rules
**The One Material Rule.** Glass is the system's only elevation device. Panels are never nested — a panel inside a panel doubles the border and the highlight and reads as a mistake; use the panel's own hairline dividers or a plain column instead.

**The Glow-Stays-Behind Rule.** The accent/violet wash is painted behind the glass, never on it, and it never brightens into a decorative wash on a light ground.

## Shapes

Two radii, and a pill for anything that is a value rather than a surface. Panels, the top bar, and the map sidebar take `0.75rem`; controls, cards, inputs, and modals take `0.5rem`; badges, chips, and progress tracks are fully rounded (`999px`). Borders are hairline and never thicker than `1px` on one side alone — the console's KPI dividers are `1px` hairlines between readings, not accent stripes.

The recurring silhouette is the frosted panel: a detached, fully-inset surface with rounded corners that shows the glow around every edge. Nothing is clipped to a shape; the map frame is the only rounded clip, and icons are drawn as one-weight stroke SVG rather than glyphs or emoji.

## Components

### Buttons
- **Shape:** gently rounded (`0.5rem`), `1px` transparent border so variants share a box.
- **Primary:** Authority Blue fill (`hsl(216 94% 49%)`) with `accent-ink` text, `0.5rem 0.9rem` padding, `0.875rem` at weight 500.
- **Hover / Focus:** hover steps the fill to `hsl(216 95% 58%)`; focus is a global `2px` accent outline at `2px` offset; disabled drops to `0.55` opacity with a not-allowed cursor.
- **Secondary:** Raised fill with a hairline border, stepping to Track on hover. **Danger** and **Success** fill from `level-severe` and `level-none` respectively.

### Chips
- **Style:** the status/role badge — a `999px` pill with a `0.14`-alpha tint of its own hue, a `0.3`-alpha hairline of the same hue, and text blended 75/25 toward the theme text colour. `0.6875rem` at weight 500, capitalised, never wrapping.
- **State:** one class per status and per role (`badge-submitted`, `badge-verified`, `badge-traffic_officer`…), each pointing at its token; a stage that stalls on the reporter (`needs_clarification`) reads as `level-heavy`.

### Cards / Containers
- **Corner Style:** `0.5rem` for the generic card, `0.75rem` for a console panel.
- **Background:** Panel, or Panel at `0.55–0.88` alpha when the card floats.
- **Shadow Strategy:** the One Material Rule above.
- **Border:** hairline `line-strong` at `0.16` alpha.
- **Internal Padding:** `0.875rem` for a card, `8–12px` for console panels.

### Inputs / Fields
- **Style:** Raised fill, hairline border, `0.5rem` radius, `0.9375rem` text.
- **Focus:** the border turns accent with a `1px` accent box-shadow ring; placeholders use Text III.
- **Field captions:** labels are uppercase `0.6875rem` at `0.14em` tracking in Text III. A label wrapping a checkbox or radio opts out and reads as a normal caption, because it is one.

### Navigation
The top bar is a floating rounded pill, sticky at `0.75rem` from the top, inset from the shell edges so the page scrolls under it. Links are Text II at weight 500 on a `0.5rem` radius; hover fills Raised and returns Text I; the active route takes a `0.15` accent tint and `accent-text`. Nav items and their order are fixed by the app.

### The Pipeline Rail (signature)
The admin console's spine: eight lifecycle stages as one grid of buttons, each carrying a status pip, an uppercase stage name, a large count, and a share bar drawn to that stage's weight in the pipeline. Selecting a stage is a **lens** — it scopes the map pins and the queue below it and never rewrites the counts above it, which the rail states in a scope line. The selected stage extends (`padding-bottom` grows) and takes the accent border and tint; `needs_clarification` keeps a permanent amber edge because it is the stage that stalls on the reporter; `rejected` stays visible as the cancelled stage rather than being dropped from the flow.

### The Situation Strip
Every official surface opens with one line of operational status — a dot, a tabular figure, and a caption, repeated three or four times across the top, in a `role="status"` region. It is instrumentation, not a hero: the figures stay near body size, colour is carried by the dot, and sample data is labelled in the same line.

## Do's and Don'ts

### Do:
- **Do** give a floating surface all four glass properties together: translucent fill, backdrop blur, hairline border, inset top highlight.
- **Do** set every figure in `font-variant-numeric: tabular-nums` and read rank from scale.
- **Do** blend tinted text 75% toward the theme text colour and keep the raw hue for the dot or bar instead.
- **Do** keep both themes driven from the one token set in `client/src/index.css`, and check a new surface in light as well as dark.
- **Do** state the counting rules next to analytics that depend on them, and label sample data as sample.
- **Do** theme the browser's own surfaces (selection, caret, scrollbars, focus ring) from the same tokens.

### Don't:
- **Don't** nest a panel inside a panel; the doubled border and highlight read as an error.
- **Don't** tint anything decoratively; a saturated hue means a status, severity, delta, or the one accent.
- **Don't** use emoji or Unicode glyphs as icons; draw the SVG at one stroke weight.
- **Don't** add a label above a heading to explain it, and don't put a hard offset shadow on anything.
- **Don't** let status or severity ride on colour alone.
- **Don't** animate anything without the matching `prefers-reduced-motion` guard.
