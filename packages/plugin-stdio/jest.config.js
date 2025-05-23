module.exports = {
  displayName: 'plugin-stdio',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json'
    }
  },
  moduleNameMapper: {
    '^@arifwidianto/msa-core$': '<rootDir>/../core/src/index.ts'
  }
};
