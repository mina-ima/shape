import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";

export default [
  { ignores: ["public/**", "dist/**"] },
  { languageOptions: { globals: globals.browser } },
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-explicit-any": "off", // 一時的に無効化
      "@typescript-eslint/ban-ts-comment": "off", // 一時的に無効化
      "@typescript-eslint/no-unused-vars": "off", // 一時的に無効化
    },
  },
];
