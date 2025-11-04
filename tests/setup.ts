/**
 * Jest Setup File
 * Runs before each test file (not globally)
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Increase timeout for system tests
jest.setTimeout(30000);

// Per-test-file setup (runs for each test file)
beforeAll(() => {
  console.log('🚀 Starting test file...');
});

afterAll(() => {
  console.log('✅ Test file completed');
});
