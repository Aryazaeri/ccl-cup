import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'scripts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // Fast-refresh ergonomics, not correctness. AuthContext deliberately
      // exports its hook beside its provider; splitting them buys nothing.
      'react-refresh/only-export-components': 'warn',
      // React Compiler guidance. Every current hit is either an async data
      // load (`void refresh()`) or a lazy default selection, both of which
      // are idiomatic today. Kept visible rather than silenced.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Test files run under tsx in Node, not the browser.
    files: ['tests/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
)
