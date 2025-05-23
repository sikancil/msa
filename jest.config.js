module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  projects: [
    '<rootDir>/packages/core/jest.config.js',
    '<rootDir>/packages/plugin-http/jest.config.js',
    '<rootDir>/packages/plugin-websocket/jest.config.js',
    '<rootDir>/packages/plugin-stdio/jest.config.js',
    '<rootDir>/packages/plugin-langchain/jest.config.js',
    '<rootDir>/packages/plugin-mcp/jest.config.js',
    '<rootDir>/packages/plugin-messagebroker/jest.config.js',
  ],
  // Optional: Collect coverage from all packages
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage/',
  collectCoverageFrom: [
    '<rootDir>/packages/*/src/**/*.ts',
    '!<rootDir>/packages/*/src/**/index.ts', // Usually, index files just re-export, adjust if needed
    '!<rootDir>/packages/*/src/**/*.d.ts', // Exclude type definition files
  ],
};
