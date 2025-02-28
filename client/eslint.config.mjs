import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Create a flat config that includes both configurations
const eslintConfig = [
  // Include configurations from the original eslint.config.mjs
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  
  // Add rules from .eslintrc.json
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@next/next/no-img-element": "warn"
    }
  }
];

export default eslintConfig;
