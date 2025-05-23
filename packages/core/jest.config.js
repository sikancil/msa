module.exports = {
  displayName: 'core',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  globals: {
    'ts-jest': {
      // Correct path relative to the root jest.config.js for monorepo setup
      // or make tsconfig discoverable from this file's location.
      tsconfig: '<rootDir>/tsconfig.json' // This points to packages/core/tsconfig.json
    }
  },
  // If 'msa-core' is an alias in tsconfig paths, map it for Jest
  moduleNameMapper: {
    '^@arifwidianto/msa-core$': '<rootDir>/src/index.ts' // Adjust if your src/index.ts is different
  }
};
