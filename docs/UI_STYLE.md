# File Butler UI Style

The desktop app should look and feel like OffKilter, not like a separate utility brand.

## Source Of Truth

Use the public OffKilter site styling and the bundled brand files as the reference:

- `assets/brand/offkilter-logo-primary.svg`
- `assets/brand/offkilter-logo-compact.svg`
- `assets/brand/offkilter-mark.svg`
- `assets/brand/offkilter-wordmark.svg`
- `assets/brand/offkilter-icon-512.png`
- `assets/brand/file-butler-icon.png`

## Visual Rules

- Keep the UI quiet, clean, and practical.
- Use the OffKilter palette: paper background, ink text, muted support text, white/surface panels, green primary actions, burnt-orange accent only where useful.
- Prefer compact, clear controls over decorative layouts.
- Keep cards/panels at small radius consistent with OffKilter (`6px`).
- Use plain language: folder, preview, apply, undo, needs review.
- No marketing hero inside the desktop app.
- No complex dashboards in the MVP.

## OffKilter CTA

Every OffKilter plugin should include an obvious but non-obstructive OffKilter CTA in the main dashboard or primary usable flow.

For File Butler, place it in the app header or footer action area as a secondary CTA, not as a modal, blocking banner, or marketing hero. The CTA should always be visible during normal use, but it must not compete with Preview, Apply, or Undo.

Recommended CTA text examples:

- Open OffKilter
- Get more OffKilter tools
- Manage in OffKilter

Use the CTA to point users back to the broader OffKilter product/app ecosystem. Keep it visually consistent with the plugin UI and clearly secondary to the plugin's current task.

## MVP Screen Shape

The first app should have one main setup screen:

1. App header with compact OffKilter/File Butler identity.
2. Three folder slots.
3. Each slot: choose folder, choose action, rename pattern, enabled toggle.
4. Preview panel showing planned changes.
5. Footer action row: Preview, Apply, Undo last run.

The core product behaviour remains in `packages/core`; the UI only configures and presents it.
