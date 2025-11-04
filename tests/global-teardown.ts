/**
 * Global Teardown - Runs once after all test files complete
 * Cleans up non-fixture test data to keep database clean
 */

import { FixtureManager } from './helpers/fixtures';
import { logger } from '../src/utils/logger';

export default async function globalTeardown() {
  console.log('🧹 Global Teardown: Cleaning up non-fixture test data...');
  
  try {
    await FixtureManager.cleanupMutableData();
    console.log('✅ Global Teardown: Non-fixture data cleaned up successfully');
  } catch (error) {
    logger.error('❌ Global Teardown failed:', error);
    // Don't throw - let tests complete even if cleanup fails
  }
}
