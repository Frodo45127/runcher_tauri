import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  jsdoc.configs['flat/recommended'],
  {
    files: ['**/*.ts'],
    plugins: {
      jsdoc,
    },
    rules: {
      'jsdoc/require-description': 'warn',
      'jsdoc/no-undefined-types': [
        'warn', 
        {
          'definedTypes': [
            'HTMLElement',
            'DragEvent'
          ]
        }
      ]
    }
  }
);
