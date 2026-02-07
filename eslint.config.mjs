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
    ...typescriptEslint.configs.stylisticTypeChecked,
    pluginPromise.configs["flat/recommended"],
    microsoftPowerApps.configs.paCheckerHosted,
    reactPlugin.configs.flat.recommended,
    {
        plugins: { "@microsoft/power-apps": microsoftPowerApps },
        languageOptions: {
            globals: { ...globals.browser, ComponentFramework: true },
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: "module",
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/prefer-nullish-coalescing": "off",
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/no-misused-promises": "off",
            "@typescript-eslint/restrict-template-expressions": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/triple-slash-reference": "off",
            "react/no-deprecated": "off"
        },
        settings: { react: { version: "detect" } },
    },
];
