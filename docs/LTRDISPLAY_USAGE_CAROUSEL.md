# LTRDisplay Control User Guide

This document explains how to use the LTRDisplay control in UCI with a complete visual walkthrough.

## Prerequisites

- You can open a System User record on the `LTRDisplay Main Form`.
- You have permission to read views/forms and related metadata.
- The control is configured with archive mode enabled.

## Step-by-Step Usage

### 1. Open the form (initial state)

At initial load, the control shows entity/view selectors and action buttons.

![Initial form load](media/09-initial-form-load.png)

### 2. Run Fetch Archive

Click `Fetch Archive` to query retained records using the selected view.

During fetch, controls may be temporarily disabled and a loading message appears.

![Fetch Archive loading](media/05-fetch-archive-loading.png)

### 3. Review cached replay with Show Cached

Click `Show Cached` to render from local cache without a new archive fetch.

![Show Cached grid](media/06-show-cached-grid.png)

### 4. Work with grid rows

The grid shows view-based columns and supports filtering and paging.

![Grid baseline](media/01-grid-and-actions.png)

### 5. Open a row and switch forms if needed

Select a row to open detail context. Use the form switcher to change form layout for that record type.

![Form switcher](media/07-form-switcher-menu.png)

### 6. Use Record Data tab

Open `Record Data` to inspect field/value output with label mapping.

![Record Data tab](media/02-record-data-tab.png)

### 7. Use Audit History tab

Open `Audit History` to review changed-on/by, operation, and old/new values when available.

![Audit History tab](media/03-audit-history-tab.png)

### 8. Use Related tab

Open `Related`, pick a relationship, and click `Load` (or `Reload`) to fetch related records on demand.

![Related tab](media/04-related-tab.png)

### 9. Toggle header and command bar

Use the up/down controls in the LTRDisplay panel to show or hide form chrome.

![Header shown](media/08-header-shown.png)

## Quick Behavior Notes

- `Fetch Archive` queries retained data and updates user cache.
- `Show Cached` reads from cache and applies local filtering.
- Related data is lazy-loaded only when requested.
- Audit output depends on Dataverse audit data availability.
