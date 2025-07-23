const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const integrationConfig = {
  displayName: 'Integration Tests',
  testEnvironment: 'jest-environment-jsdom',
  
  // Integration test specific setup
  setupFilesAfterEnv: ['<rootDir>/jest.integration.setup.js'],
  
  // Only run integration tests
  testMatch: [
    '<rootDir>/tests/integration/**/*.test.{js,jsx,ts,tsx}',
  ],
  
  // Module name mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Longer timeout for integration tests
  testTimeout: 30000,
  
  // Run tests serially for integration tests
  maxWorkers: 1,
  
  // Don't collect coverage for integration tests by default
  collectCoverage: false,
  
  // Verbose output for integration tests
  verbose: true,
  
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/integration/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/integration/setup/globalTeardown.js',
};

module.exports = createJestConfig(integrationConfig);