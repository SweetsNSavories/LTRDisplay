# LTR Display PCF Control

A model-driven app control to surface Long Term Retention (LTR) records for a Dataverse entity using views/forms.

## How to add to a form (quick start)
1) On your form, create a **single tab** with **one section** and **one column**. You can hide all existing data-bound fields in that section.
2) Add any text field (e.g., Middle Name) to the section, then change its control to **LTR Display Control**.
3) Set control properties:
   - **ltrEntities**: comma/semicolon list of allowed entities. Format: `logicalname[:Display Name]`, e.g., `account:Account;incident:Case`. This drives the **Select Entity** combobox.
   - **targetEntity**: optional default selection; the user can pick another entity from the list at runtime.
   - **isArchive**: leave **On/True** so data is pulled from the retention store only.
4) Save, publish, and open the form. The control shows a combobox to pick the entity, a view dropdown for saved queries of that entity, and renders records/forms from the retained store.

## Behavior and requirements
- The control reads **savedquery** (views) and **systemform** (forms) for the target entity, so the user needs read access to those plus the entity itself.
- When **isArchive** is true (recommended), FetchXML is forced to `datasource="retained"`, ensuring results come from LTR and not the active Dataverse store.
- Diagnostics log to the browser console with the prefix `[LTRDisplay]` for all fetches, selections, and errors.

## Packaging
- Unmanaged: `solution/LTRDisplay_1_0_0_0_unmanaged.zip`
- Managed: `solution/LTRDisplay_1_0_0_0_managed.zip`
