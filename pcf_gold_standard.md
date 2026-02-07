# PCF Gold Standard: VS Code (Code-Only) Environment

This guide defines the definitive "Gold Standard" for PCF project structure and configuration. It is designed to work reliably with `pac pcf push` and modern `pcf-scripts` without depending on Visual Studio Enterprise or its Power Platform Tools.

## 1. Project Structure (The "Root-Subfolder" Pattern)
The primary secret to success is keeping the project file and configurations in the **root** and all source code in a **single subfolder**.

```text
/Root
  ├── .gitignore
  ├── package.json               <-- Dev dependencies go here
  ├── pcfconfig.json               <-- REQUIRED (Absolute or Relative outDir)
  ├── tsconfig.json                <-- REQUIRED (Must point to subfolder)
  ├── eslint.config.mjs            <-- REQUIRED (Flat Config)
  ├── MyControl.pcfproj            <-- "Old Style" MSBuild format
  └── /MyControl (Subfolder)       <-- ALL source code goes here
       ├── ControlManifest.Input.xml
       ├── index.ts
       ├── /components
       ├── /services
       └── /generated              <-- Type definitions
```

## 2. Mandatory Configuration Files

### A. `pcfconfig.json` (Root)
Tells the CLI where the build output should live.
```json
{
    "outDir": "./out/controls"
}
```

### B. `tsconfig.json` (Root)
Must extend the PCF base and explicitly include the subfolder files.
```json
{
    "extends": "./node_modules/pcf-scripts/tsconfig_base.json",
    "compilerOptions": {
        "typeRoots": ["node_modules/@types"],
        "types": ["powerapps-component-framework", "react", "react-dom"],
        "jsx": "react",
        "strict": false,
        "noImplicitAny": false
    },
    "include": [
        "MyControl/index.ts",
        "MyControl/components/**/*.tsx",
        "MyControl/generated/**/*.ts"
    ]
}
```

### C. `eslint.config.mjs` (Root)
Modern `pcf-scripts` strictly enforces linting. Use this "Loose" configuration to avoid build halts on legacy code.
```javascript
import eslintjs from "@eslint/js";
import microsoftPowerApps from "@microsoft/eslint-plugin-power-apps";
import pluginPromise from "eslint-plugin-promise";
import reactPlugin from "eslint-plugin-react";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

export default [
  { ignores: ["**/generated", "**/out/**", "**/bundle.js"] },
  eslintjs.configs.recommended,
  ...typescriptEslint.configs.recommendedTypeChecked,
  pluginPromise.configs["flat/recommended"],
  microsoftPowerApps.configs.paCheckerHosted,
  reactPlugin.configs.flat.recommended,
  {
    plugins: { "@microsoft/power-apps": microsoftPowerApps },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/require-await": "off",
      "react/no-deprecated": "off"
    },
    settings: { react: { version: "detect" } },
  },
];
```

### D. `.pcfproj` (Root)
Use the **Explicit Reference Style** instead of `<Project Sdk="...">`. This bypasses SDK resolution errors on machines without Visual Studio.

```xml
<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="15.0" DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <PropertyGroup>
    <PowerAppsTargetsPath>$(MSBuildExtensionsPath)\Microsoft\VisualStudio\v$(VisualStudioVersion)\PowerApps</PowerAppsTargetsPath>
  </PropertyGroup>

  <Import Project="$(MSBuildExtensionsPath)\$(MSBuildToolsVersion)\Microsoft.Common.props" />
  <Import Project="$(PowerAppsTargetsPath)\Microsoft.PowerApps.VisualStudio.Pcf.props" Condition="Exists('$(PowerAppsTargetsPath)\Microsoft.PowerApps.VisualStudio.Pcf.props')" />

  <PropertyGroup>
    <Name>MyControlName</Name>
    <ProjectGuid>{YOUR-GUID-HERE}</ProjectGuid>
    <OutputPath>$(MSBuildThisFileDirectory)out\controls</OutputPath>
    <TargetFrameworkVersion>v4.6.2</TargetFrameworkVersion>
    <TargetFramework>net462</TargetFramework>
    <RestoreProjectStyle>PackageReference</RestoreProjectStyle>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.PowerApps.MSBuild.Pcf" Version="1.*" />
    <PackageReference Include="Microsoft.NETFramework.ReferenceAssemblies" Version="1.0.0" PrivateAssets="All" />
  </ItemGroup>

  <ItemGroup>
    <None Include="$(MSBuildThisFileDirectory)\**" Exclude="$(MSBuildThisFileDirectory)\node_modules\**;$(MSBuildThisFileDirectory)\bin\**;$(MSBuildThisFileDirectory)\obj\**;$(OutputPath)\**" />
  </ItemGroup>

  <Import Project="$(PowerAppsTargetsPath)\Microsoft.PowerApps.VisualStudio.Pcf.targets" Condition="Exists('$(PowerAppsTargetsPath)\Microsoft.PowerApps.VisualStudio.Pcf.targets')" />
</Project>
```

## 3. Required Dependencies
Run this in the root to ensure all tools are present:
```bash
npm install --save-dev @eslint/js @microsoft/eslint-plugin-power-apps eslint-plugin-promise eslint-plugin-react globals typescript-eslint @types/powerapps-component-framework
```

## 4. Troubleshooting Checklist
- **SDK missing?**: Ensure `.pcfproj` uses the Explicit Reference Style (Section 2D).
- **TypeScript errors?**: Ensure `tsconfig.json` extends the base and includes `types` (Section 2B).
- **ESLint parsing error?**: Ensure `eslint.config.mjs` is in the root and `ignores` include the output folder.
- **Empty solution zip?**: Ensure the `ProjectReference` in your `.cdsproj` (in the solution folder) correctly points to the new root location of your `.pcfproj`.
