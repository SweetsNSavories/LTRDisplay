# LTR Display Control: Architecture and Cache Design

This document explains how the control works end to end, with a focus on retained-data query minimization and user-local cache behavior.

## Goals

- Show retained records in a model-driven app using familiar grid/form patterns.
- Minimize expensive retained FetchXML calls.
- Keep navigation fast by opening records from browser cache whenever possible.
- Support multi-level parent -> child -> grandchild navigation in one control surface.

## Runtime Components

- `LTRDisplayControl/index.ts`: PCF shell, React mount/unmount.
- `LTRDisplayControl/components/App.tsx`: Main state orchestrator.
- `LTRDisplayControl/components/DynamicGrid.tsx`: Grid view, header funnel filters.
- `LTRDisplayControl/components/DynamicForm.tsx`: Metadata-driven read-only detail form and related tab.
- `LTRDisplayControl/services/LtrService.ts`: Dataverse metadata/data access.
- `LTRDisplayControl/utils/XmlParser.ts`: View/form XML parsers.

## Entity Eligibility Logic

### Select Entity Combo

Primary source:
- Active `retentionconfig` records (`statecode = 0`) via Dataverse Web API.
- Distinct `entitylogicalname` values become the selectable entity list.

Fallback source:
- Entity metadata flags (`IsArchivalEnabled` / `IsRetentionEnabled`) if retention policy query is unavailable or empty.

This ensures environments without configured policies still remain usable.

### Related Entity Eligibility

Related child tables are filtered by child metadata:
- `IsArchivalEnabled` must be `true`.

This is intentionally independent from whether child tables have their own direct retention policy records, because child rows may still be archived through parent retention behavior.

## Data Access Strategy

### Grid Data Fetch

- User selects entity + view.
- View FetchXML is used as base query.
- Optional top search clause (`Select Column` + `Search` + `Apply Fetch Clause`) is appended to FetchXML.
- Query is expanded to all attributes for local detail rendering.
- In archive mode, root fetch is forced to `datasource="retained"`.
- Results are paged up to cap and then cached locally.

### Detail Form Rendering

- No extra detail query is required for row open in normal flow.
- Selected row payload from local cache is used for form rendering.
- Field resolver handles direct values, formatted values, and lookup variants (`_field_value`).

### Related Data Fetch

- Related tab lists metadata-derived one-to-many relationships.
- Related rows are loaded on explicit user action (`Load`/`Reload`) to preserve retained query quota.
- In archive mode, related fetches also use retained datasource.

## Browser Local Cache Model

Global key:
- `window.__ltrDisplayCache`

Scope:
- Per user (`byUser[userId]`).

Buckets:
- `views`: Grid datasets by entity/view/search/archive mode.
- `related`: Related datasets by entity/record/relationship/archive mode.
- `forms`: Main form metadata by entity.
- `relationships`: One-to-many metadata by entity.

Key examples:
- View: `entity|viewId|retainedOrActive|searchColumn|searchText`
- Related: `entity|recordId|relationshipSchema|retainedOrActive`

## Grid UX Behavior

- Header funnel icon opens flyout with `Apply` and `Clear`.
- Header filters are local-only over cached data.
- Footer pagination is local-only (`Prev/Next`, page size, range summary).
- No server call for header filtering or paging.

## Form Navigation Behavior

- Opening related row loads child in same detail panel.
- Parent context is pushed onto a stack.
- Back button pops stack to prior context.
- Works recursively for deep hierarchies.

## Diagnostics

All runtime diagnostics use prefix:
- `[LTRDisplay]`

Useful troubleshooting categories:
- Retention entity discovery path (`retentionconfig` and metadata fallback).
- Grid data fetch/cache hits.
- Related metadata/data fetch and cache hits.
- Record ID resolution for open actions.

## Packaging and Distribution

The exported solution packages include:
- PCF control binaries and manifest.
- System User form customizations that host the PCF.

Current package outputs:
- `solution/LTRDisplay_unmanaged_latest.zip`
- `solution/LTRDisplay_managed_latest.zip`

Recommended distribution:
- Managed zip for marketplace/consumer installs.
- Unmanaged zip for partner/internal customization scenarios.
