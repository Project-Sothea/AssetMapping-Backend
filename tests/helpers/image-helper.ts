/**
 * Image Helper for System Tests
 * Provides utilities for testing image operations and simulating storage failures
 */

import { imageService } from '../../src/services/image.service';

export class ImageHelper {
  /**
   * Generate test image URLs for a given pin
   */
  static generateImageUrls(pinId: string, count: number = 1): string[] {
    return Array.from(
      { length: count },
      (_, i) =>
        `https://example.supabase.co/storage/v1/object/public/images/pin/${pinId}/image-${i + 1}.jpg`
    );
  }

  /**
   * Create mock image deletion failure
   */
  static mockImageDeletionFailure(
    errorMessage: string = 'Storage network timeout'
  ): jest.SpyInstance {
    return jest.spyOn(imageService, 'deleteImages').mockImplementation(async () => {
      throw new Error(errorMessage);
    });
  }

  /**
   * Create mock image deletion that tracks deleted URLs
   */
  static mockImageDeletionWithTracking(): {
    spy: jest.SpyInstance;
    deletedUrls: string[];
  } {
    const deletedUrls: string[] = [];
    const spy = jest
      .spyOn(imageService, 'deleteImages')
      .mockImplementation(async (urls: string[]) => {
        deletedUrls.push(...urls);
        return Promise.resolve();
      });

    return { spy, deletedUrls };
  }

  /**
   * Create mock image deletion with partial failures
   */
  static mockPartialImageDeletionFailure(failureRate: number = 0.5): {
    spy: jest.SpyInstance;
    deletedUrls: string[];
    failedUrls: string[];
  } {
    const deletedUrls: string[] = [];
    const failedUrls: string[] = [];

    const spy = jest
      .spyOn(imageService, 'deleteImages')
      .mockImplementation(async (urls: string[]) => {
        for (const url of urls) {
          if (Math.random() < failureRate) {
            failedUrls.push(url);
          } else {
            deletedUrls.push(url);
          }
        }

        if (failedUrls.length > 0) {
          throw new Error(`Failed to delete ${failedUrls.length} images`);
        }

        return Promise.resolve();
      });

    return { spy, deletedUrls, failedUrls };
  }

  /**
   * Verify image URLs format
   */
  static validateImageUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'https:' && urlObj.pathname.includes('/images/');
    } catch {
      return false;
    }
  }

  /**
   * Compare two image arrays
   */
  static compareImageArrays(
    images1: string,
    images2: string
  ): {
    added: string[];
    removed: string[];
    common: string[];
  } {
    const arr1: string[] = JSON.parse(images1 || '[]');
    const arr2: string[] = JSON.parse(images2 || '[]');

    const set1 = new Set(arr1);
    const set2 = new Set(arr2);

    const added = arr2.filter((url) => !set1.has(url));
    const removed = arr1.filter((url) => !set2.has(url));
    const common = arr1.filter((url) => set2.has(url));

    return { added, removed, common };
  }

  /**
   * Create a pin payload with images
   */
  static createPinWithImages(pinData: any, imageCount: number): any {
    const images = ImageHelper.generateImageUrls(pinData.id || 'test-pin', imageCount);
    return {
      ...pinData,
      images: JSON.stringify(images),
    };
  }

  /**
   * Simulate gradual image deletion (for testing race conditions)
   */
  static mockGradualImageDeletion(delayMs: number = 100): {
    spy: jest.SpyInstance;
    deletedUrls: string[];
  } {
    const deletedUrls: string[] = [];

    const spy = jest
      .spyOn(imageService, 'deleteImages')
      .mockImplementation(async (urls: string[]) => {
        for (const url of urls) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          deletedUrls.push(url);
        }
        return Promise.resolve();
      });

    return { spy, deletedUrls };
  }
}
