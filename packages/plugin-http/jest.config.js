module.exports = {
  displayName: 'plugin-http',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json'
    }
  },
  moduleNameMapper: {
    '^@arifwidianto/msa-core$': '<rootDir>/../core/src/index.ts' // Adjust path based on actual structure
  }
};
