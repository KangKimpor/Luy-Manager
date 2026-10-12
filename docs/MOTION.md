# Feedback and motion

Motion uses the shared tokens in `src/app/globals.css`. Small interactions settle
in 160ms, panels and selection indicators in 240ms, and page entrances in 300ms.
The common easing curve is `cubic-bezier(0.22, 1, 0.36, 1)`.

| Element | Trigger | Feedback |
| --- | --- | --- |
| Buttons and app links | Press | Small scale change, with tap tint on shared buttons |
| Navigation and link icons | Pointer hover | Small icon enlargement, only with a fine pointer |
| Entry type and display currency | Selection | Highlight slides beneath the selected button in 240ms |
| Account and category picker | Selection | Check settles into place and the chosen label enters in 160ms |
| Account and category picker | Open | Search panel enters in 240ms |
| More options, filters, rate history | Expand or collapse | Native disclosure height and opacity transition in supporting browsers |
| Split and tender rows | Insert | New row enters in 240ms; existing rows retain their keys |
| Form submission, sign-in, exports | Pending | Shared button spinner, busy state and disabled submission |
| Account, budget, transaction actions | Pending | Compact animated track beneath the controls |
| Activity filters | Pending | Pulsing dot beside the updating message |
| Success and error messages | Result | Short entrance; confirmation icons settle and error icons nudge |
| Period navigation | New period | Period label enters in 160ms |
| Budget and category progress | Updated value | Width eases to the new value in 380ms |

## Accessibility and fallbacks

All CSS motion, including pseudo-elements, respects `prefers-reduced-motion`.
Pending controls and messages still indicate progress when animations are reduced.
Hover effects only run on devices that support hover and have a fine pointer.
Animations never delay actions or hold content hidden until they complete.

Native `details` keeps its keyboard behavior. Browsers with
`interpolate-size` and `::details-content` animate both directions; other browsers
use the existing short content entrance when opening. Only disclosure chevrons
rotate, so decorative icons within a summary retain their orientation.

## Adding feedback

Use `Button` with `loading` for an in-flight action and keep its visible label
descriptive. The shared component marks it busy, disables repeated presses and
adds a decorative spinner. Replace the resting icon while loading to keep the
button compact.

Use `feedback-enter` for a newly rendered result, `panel-enter` for a conditional
panel, and `row-enter` for inserted list items. A panel containing animated rows
does not animate as a whole, avoiding stacked fades. Keep stable keys for existing
rows so editing them does not replay their entrance.
