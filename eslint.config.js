const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'backups/**', 'tmp/**'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-console': 'off',
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
  {
    files: ['scripts/replica-set-init.js'],
    languageOptions: {
      globals: { ...globals.node, rs: 'readonly', print: 'readonly' },
    },
  },
];
