/**
 * Global Setup - Runs once before all test files
 * Seeds global fixtures that will be reused across all tests
 */

import { FixtureManager } from './helpers/fixtures';

export default async function globalSetup() {
  console.log('🌱 Global Setup: Seeding fixtures once for all tests...');
  await FixtureManager.seedGlobalFixtures();
  console.log('✅ Global Setup: Fixtures seeded successfully');
}
