const typescriptEslint = require("@typescript-eslint/eslint-plugin"); // plugin
const parser = require("@typescript-eslint/parser"); // parser

module.exports = [
  {
    files: ["**/*.ts"],
  },
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
      parser: parser,
      ecmaVersion: 2022,
      sourceType: "module",
    },

    rules: {
      "@typescript-eslint/naming-convention": ["warn", {
        selector: "import",
        format: ["camelCase", "PascalCase"],
      }],

      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      semi: "warn",
    },

    ignores: [
      'node_modules',
      'out',
      'dist',
      '.vscode-test',
    ],
  }
];
