import type { Pin, EntityType } from '@assetmapping/shared-types';
import { PinService } from '../../pin.service';
import { BaseOperations } from './base.operations';

/**
 * Pin Operations Service
 */
export class PinOperations extends BaseOperations<Pin> {
  getEntityType(): EntityType {
    return 'pin';
  }

  async getUpdatedAt(id: string): Promise<Date | null> {
    return PinService.getPinUpdatedAt(id);
  }

  async getVersion(id: string): Promise<number | null> {
    return PinService.getPinVersion(id);
  }

  async performUpsert(data: Pin, version: number): Promise<Pin> {
    return await PinService.upsertPin(data, version);
  }

  async performDelete(id: string): Promise<void> {
    await PinService.deletePin(id);
  }
}

export const pinOperations = new PinOperations();
