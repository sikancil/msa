module.exports = {
  displayName: 'plugin-mcp',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json' // This should point to packages/plugin-mcp/tsconfig.json
    }
  },
  moduleNameMapper: {
    // If you use path aliases in tsconfig.json that Jest needs to understand
    // e.g., "^@core/(.*)$": "<rootDir>/../core/src/$1"
    // For this plugin, we need to ensure it can find @arifwidianto/msa-core
    '^@arifwidianto/msa-core$': '<rootDir>/../core/src/index.ts'
  }
};
