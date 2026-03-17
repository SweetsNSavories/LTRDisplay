# LTRDisplay Design And Runtime Behavior

This document describes how the control is expected to behave in production and what customers should validate after importing the managed solution.

## 1. Data Source Model

- The control is archive-focused.
- The top data source toggle is removed from the UI.
- The control runs in archive mode and queries retained data.

## 2. View Clause And Fetch Behavior

- The selected Dataverse view FetchXML clause is used to fetch data from archive.
- The same selected view clause is also applied when projecting cached rows to the grid.
- Related-entity clauses inside the view are not used to fetch or filter related tab data.
- Related records are loaded using explicit relationship metadata and related-record fetch paths.

## 3. Fetch Archive vs Show Cached

- Fetch Archive:
  - Calls archive fetch with the selected view.
  - Stores results in user cache.
  - Grid then renders from cache projection.
- Show Cached:
  - Does not call archive fetch.
  - Reads from user cache only.
  - Applies selected view clause locally to cached rows before display.

## 4. User Cache Model

- Cache is per user.
- Cache persists in browser storage for the current user.
- Cache stores:
  - View result sets.
  - Entity record dictionary (record-by-id).
  - Related result sets.
  - Forms metadata.
  - Relationship metadata.
- Grid/form rendering paths prefer cache data once available.

## 5. Grid And Initial Load (Paging / nextLink)

- Archive fetch reads result pages and follows nextLink when returned by Dataverse.
- Records are accumulated page-by-page until:
  - no nextLink remains, or
  - maxRows is reached.
- After fetch, rows are cached and the grid renders from cached projection.
- Header filters and pagination are client-side against the projected grid rows.

## 6. Form Rendering And Form Selector

- The form selector lets users switch among available main forms for the current entity.
- Form layout is parsed from form metadata (tabs, sections, cells).
- Display values in the form are matched to metadata field definitions.
- Record Data tab shows key/value data using display labels where available from form metadata.

## 7. Related Records Tab

- Related data is lazy-loaded.
- Nothing is fetched until the user clicks Load/Reload for a selected relationship.
- Selecting a related row opens that record inside the same control.
- The control supports drill-down across related records.
- Back button returns to the previous detail context in the hierarchy stack.

## 8. Audit History Tab

- Audit is fetched from Dataverse audit rows for the selected record.
- Audit entries are mapped into row-level items with event grouping feel.
- The grid includes changed-on, changed-by, operation/action, attribute, and old/new values where present.
- For retain/delete-style events, attribute details may be unavailable; event rows are still shown.

## 9. Header / Command Bar / Header Tabs Visibility

- The control provides up/down controls.
- Default state is hidden.
- Supported Xrm form API is used first:
  - header body visibility
  - command bar visibility
  - header tab navigator visibility
- Unsupported DOM fallback has been removed by design.

## 10. Security And Packaging

- LTRDisplay Main Form is intended for admin access only.
- Form security roles should be configured to System Administrator only.
- Managed and unmanaged packages include:
  - the LTRDisplay custom control files
  - SystemUser form metadata with LTRDisplay control mapping
  - form display conditions including role id references

## 11. Customer Import Validation (Managed)

After importing managed solution:

- Confirm the form exists and is enabled.
- Confirm control mapping on SystemUser form points to ltr_LTRDisplay.LTRDisplayControl.
- Validate role-based form visibility:
  - System Administrator user can open the form.
  - Non-admin user does not receive this admin form.
- Validate Fetch Archive / Show Cached behavior and drill-down/back behavior.
