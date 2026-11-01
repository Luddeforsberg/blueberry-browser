import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['**/node_modules', '**/dist', '**/out', 'site/**', 'src/main/pageActorArt.ts'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // Handlers and components infer their return types, so requiring them only adds noise.
      '@typescript-eslint/explicit-function-return-type': 'off',
      // `node` is destructured out of react-markdown props so it isn't spread onto the DOM.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // Contexts export a provider and its hook from one file on purpose.
      'react-refresh/only-export-components': 'warn'
    }
  },
  eslintConfigPrettier
)
