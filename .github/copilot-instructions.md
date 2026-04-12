# GitHub Copilot Instructions for LTRDisplay

## Project Overview
This repository contains a **Power Apps Component Framework (PCF)** control called **LTR Display Control**. It surfaces Long Term Retention (LTR) records from Microsoft Dataverse inside model-driven Power Apps forms.

## Repository Structure
```
/Root
  ├── .github/workflows/     — CI/CD (GitHub Actions: build & package)
  ├── LTRDisplayControl/     — ALL PCF source code (subfolder pattern)
  │    ├── ControlManifest.Input.xml  — Control property definitions
  │    ├── index.ts                   — PCF entry point (init/updateView/destroy)
  │    ├── components/                — React components (App.tsx, DynamicGrid.tsx, DynamicForm.tsx)
  │    ├── services/                  — Data layer (LtrService.ts: WebAPI calls)
  │    ├── utils/                     — Utilities (XmlParser.ts, Diagnostics.ts)
  │    ├── css/                       — Component styles
  │    └── generated/                 — Auto-generated type definitions (do not edit)
  ├── solution/              — Pre-built .zip artifacts (unmanaged/managed)
  ├── package.json           — Root dev dependencies and npm scripts
  ├── tsconfig.json          — TypeScript config (extends pcf-scripts base)
  ├── eslint.config.mjs      — ESLint flat config
  ├── pcfconfig.json         — PCF output directory config
  └── LTRDisplayControl.pcfproj — MSBuild project for pac solution packaging
```

## Technology Stack
- **Runtime**: TypeScript + React 16 (JSX) + Fluent UI v8 (`@fluentui/react`)
- **Build**: `pcf-scripts` (wraps Webpack), `pac` CLI for solution packaging
- **Data**: Dataverse WebAPI via `context.webAPI` (PCF framework API)
- **XML parsing**: `fast-xml-parser` for FetchXML layout and FormXML
- **Linting**: ESLint flat config (`eslint.config.mjs`) with `@microsoft/eslint-plugin-power-apps`
- **CI**: GitHub Actions on `windows-latest` (`.github/workflows/build-pcf-solution.yml`)

## Key Concepts
- **Long Term Retention (LTR)**: Dataverse feature that moves old records to a retention store. Retained records require `datasource="retained"` on FetchXML queries.
- **`isArchive` toggle**: When `true`, the control injects `datasource="retained"` into all FetchXML before executing queries.
- **`ltrEntities`**: Comma/semicolon-separated list of `logicalname[:Display Name]` pairs for the entity picker ComboBox.
- **`targetEntity`**: Default entity logical name pre-selected in the UI.

## Coding Conventions
- **All diagnostics** use the `diag` helper from `utils/Diagnostics.ts`. Prefix: `[LTRDisplay]`. Use `diag.info()` for normal flow and `diag.error()` for failures. Do not use raw `console.log` outside of utilities.
- **React components** are functional components using hooks (`useState`, `useEffect`, `useMemo`).
- **TypeScript**: `strict: false`, `noImplicitAny: false` — avoid `any` where possible but it is permitted.
- **Services** live in `services/` and depend only on `ComponentFramework.Context<IInputs>`.
- **Utilities** in `utils/` are pure helpers with no PCF context dependency.
- **Generated files** in `LTRDisplayControl/generated/` are auto-generated — never edit them manually.
- **CSS** for the control lives in `LTRDisplayControl/css/LTRDisplayControl.css`.

## Build & Development Commands (run from repo root)
```bash
npm install          # install all dependencies
npm run build        # production build via pcf-scripts
npm run rebuild      # clean + build
npm start            # local dev server (pcf-scripts start)
```

## Adding New Features
1. New React components go in `LTRDisplayControl/components/`.
2. New Dataverse service calls go in `LTRDisplayControl/services/LtrService.ts`.
3. New XML parsing helpers go in `LTRDisplayControl/utils/XmlParser.ts`.
4. New control input properties must be declared in both `ControlManifest.Input.xml` and surfaced in `index.ts` → `renderControl()`.
5. Run `npm run build` to regenerate `generated/ManifestTypes.d.ts` after manifest changes.

## FetchXML / Archive Pattern
When querying retained records always ensure `datasource="retained"` is present:
```typescript
// Correct — use LtrService.getLtrData(fetchXml, true) which auto-injects datasource
const records = await ltrService.getLtrData(view.fetchXml, isArchive);
```

## Fluent UI v8 Import Style
Always import Fluent UI components from their sub-path to keep bundle size small:
```typescript
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import { ComboBox } from '@fluentui/react/lib/ComboBox';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
```
