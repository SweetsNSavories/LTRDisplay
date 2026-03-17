# LTR Display PCF Control

A model-driven app control to surface Long Term Retention (LTR) records for a Dataverse entity using views/forms.

## Documentation
- Architecture and cache internals: `docs/ARCHITECTURE_AND_CACHE.md`
- Runtime behavior and packaging validation: `docs/DESIGN_AND_RUNTIME_BEHAVIOR.md`
- SystemUser usage walkthrough video embed: `docs/DESIGN_AND_RUNTIME_BEHAVIOR.md` (Section 12)
- Step-by-step usage manual with embedded screenshots: `docs/LTRDISPLAY_USAGE_MANUAL.md`
- All-in-one blog/PDF submission document: `docs/LTRDISPLAY_MICROSOFT_BLOG_SUBMISSION.md`

## How to add to a form (quick start)
1) On your form, create a **single tab** with **one section** and **one column**. You can hide all existing data-bound fields in that section.
2) Add any text field (e.g., Middle Name) to the section, then change its control to **LTR Display Control**.
3) Set control properties:
   - **targetEntity**: optional default selection; the user can pick another entity from the list at runtime.
   - **isArchive**: leave **On/True** so data is pulled from the retention store only.
4) Save, publish, and open the form. The control shows a combobox to pick the entity, a view dropdown for saved queries of that entity, and renders records/forms from the retained store.

## Behavior and requirements
- The control reads **savedquery** (views) and **systemform** (forms) for the target entity, so the user needs read access to those plus the entity itself.
- Select Entity is driven by active retention policy configuration (`retentionconfig` with `statecode=0`) with metadata fallback.
- Related child table eligibility is based on child metadata `IsArchivalEnabled=true`.
- When **isArchive** is true (recommended), FetchXML is forced to `datasource="retained"`, ensuring results come from LTR and not the active Dataverse store.
- Header filters and pagination are local-only against browser cache.
- Related records are loaded on explicit user action (`Load`/`Reload`) to reduce retained-query usage.
- Diagnostics log to the browser console with the prefix `[LTRDisplay]` for all fetches, selections, and errors.

## Packaging
- Unmanaged: `solution/LTRDisplay_unmanaged_latest.zip`
- Managed: `solution/LTRDisplay_managed_latest.zip`
