# LTRDisplay Control Usage Guide (Carousel + Voice-over)

Use this file as a ready storyboard for social carousel images or AI-generated video narration.

## Audience

- System Administrators
- Dataverse makers validating archive record exploration
- Demo reviewers who need a short visual walkthrough

## Slide Plan (9 slides)

### Slide 1: Initial form load

Image: `docs/media/09-initial-form-load.png`

On-screen text:
- LTRDisplay opens inside the User form.
- Select Entity and Select View are ready.

Voice-over:
- "This is the initial LTRDisplay state in UCI. No archive query has run yet, and the control is ready for entity and view selection."

### Slide 2: Fetch Archive starts

Image: `docs/media/05-fetch-archive-loading.png`

On-screen text:
- Fetch Archive started.
- Control shows loading and temporary disabled actions.

Voice-over:
- "When we click Fetch Archive, the control runs retained-data fetch using the selected Dataverse view clause."

### Slide 3: Show Cached result

Image: `docs/media/06-show-cached-grid.png`

On-screen text:
- Show Cached uses local cache.
- No new archive fetch required.

Voice-over:
- "Show Cached replays cached rows and applies local view filtering, so users can review data without another archive round-trip."

### Slide 4: Grid baseline

Image: `docs/media/01-grid-and-actions.png`

On-screen text:
- Grid columns are view-driven.
- Filters and paging are client-side.

Voice-over:
- "The grid reflects selected-view columns. Column filters and paging are handled on the client over projected rows."

### Slide 5: Open a row and detail context

Image: `docs/media/07-form-switcher-menu.png`

On-screen text:
- Selecting a row opens detail context.
- Form switcher is available.

Voice-over:
- "Selecting a row opens record detail context and exposes the form selector for alternate forms."

### Slide 6: Record Data tab

Image: `docs/media/02-record-data-tab.png`

On-screen text:
- Key/value detail is visible.
- Metadata label mapping is applied.

Voice-over:
- "Record Data shows field values with display labels where metadata mappings are available."

### Slide 7: Audit History tab

Image: `docs/media/03-audit-history-tab.png`

On-screen text:
- Changed On / Changed By
- Operation, attribute, old/new values

Voice-over:
- "Audit History displays event-style rows with operation, attribute changes, and old versus new values when provided by Dataverse audit."

### Slide 8: Related tab

Image: `docs/media/04-related-tab.png`

On-screen text:
- Relationships list is lazy-loaded.
- Load action fetches related records on demand.

Voice-over:
- "Related records are intentionally lazy-loaded. Users choose a relationship and click Load or Reload only when needed."

### Slide 9: Header shown via toggle

Image: `docs/media/08-header-shown.png`

On-screen text:
- Up/down controls toggle form chrome.
- Header and command bar can be restored.

Voice-over:
- "The control can hide form chrome by default and restore it with the toggle, using supported form APIs."

## Suggested caption text

- "LTRDisplay in action: archive fetch, cache replay, record details, audit history, and related navigation in one UCI workflow."

## Gemini prompt (copy/paste)

Create a 60-90 second product walkthrough video using 9 images in order. Use a calm technical voice-over style. Explain each screen briefly with one sentence, then transition to the next. Keep terminology consistent with Dataverse and UCI. End with a summary that highlights: Fetch Archive, Show Cached, Record Data, Audit History, Related, and form chrome toggle.

Image order:
1) docs/media/09-initial-form-load.png
2) docs/media/05-fetch-archive-loading.png
3) docs/media/06-show-cached-grid.png
4) docs/media/01-grid-and-actions.png
5) docs/media/07-form-switcher-menu.png
6) docs/media/02-record-data-tab.png
7) docs/media/03-audit-history-tab.png
8) docs/media/04-related-tab.png
9) docs/media/08-header-shown.png
