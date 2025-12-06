import { EntityType, OperationType } from '@assetmapping/shared-types';

import { logger } from '../../../utils/logger';

import { IOperations } from './operations.interface';

interface BaseEntity {
  id: string;
  version: number | null;
  updatedAt: Date | null;
}

export abstract class BaseOperations<T extends BaseEntity> implements IOperations<T> {
  abstract getEntityType(): EntityType;
  abstract getUpdatedAt(id: string): Promise<Date | null>;
  abstract getVersion(id: string): Promise<number | null>;
  abstract performUpsert(data: T, version: number): Promise<T>;
  abstract performDelete(id: string): Promise<void>;

  async syncEntity(
    operation: OperationType,
    data: T
  ): Promise<T | { id: string; deleted: boolean }> {
    logger.info(`Syncing ${this.getEntityType()}`, { operation, id: data.id });

    if (operation === 'delete') {
      return this.deleteEntity(data.id);
    }

    return this.upsertEntity(data);
  }

  private async deleteEntity(id: string): Promise<{ id: string; deleted: boolean }> {
    await this.performDelete(id);
    return { id, deleted: true };
  }

  private async upsertEntity(data: T): Promise<T> {
    // Version conflict check
    await this.resolveVersionConflict(data);

    const version = await this.incrVersionOrSetOne(data);
    const result = await this.performUpsert(data, version);

    logger.info(`${this.getEntityType()} synced successfully`, {
      id: result.id,
      version: result.version,
    });
    return result;
  }

  private async resolveVersionConflict(data: T): Promise<void> {
    if (!data.version) return;

    const currentVersion = await this.getVersion(data.id);
    if (currentVersion === null || currentVersion <= 0 || data.version >= currentVersion) return;

    const serverUpdatedAt = await this.getUpdatedAt(data.id);
    if (!serverUpdatedAt) return;

    await this.checkLastWriteWins(data, currentVersion, serverUpdatedAt);

    const clientTimeIso = (data.updatedAt || new Date(0)).toISOString();
    logger.info(`Accepting newer update despite version conflict for ${this.getEntityType()}`, {
      id: data.id,
      clientVersion: data.version,
      serverVersion: currentVersion,
      clientTime: clientTimeIso,
      serverTime: serverUpdatedAt.toISOString(),
    });
  }

  private async incrVersionOrSetOne(data: T): Promise<number> {
    let version = 1;
    const existingVersion = await this.getVersion(data.id);
    if (existingVersion !== null) {
      version = existingVersion + 1;
      logger.info(`Incrementing version for existing ${this.getEntityType()}`, {
        id: data.id,
        oldVersion: existingVersion,
        newVersion: version,
      });
    } else {
      logger.info(`Creating ${this.getEntityType()} without ID`);
    }
    return version;
  }

  private async checkLastWriteWins(
    data: T,
    currentVersion: number,
    serverUpdatedAt: Date
  ): Promise<void> {
    const clientDate = data.updatedAt || new Date(0);
    const clientTime = clientDate.getTime();
    const serverTime = serverUpdatedAt.getTime();

    if (serverTime >= clientTime) {
      logger.warn(`Rejecting older update - server data is newer for ${this.getEntityType()}`, {
        id: data.id,
        clientVersion: data.version,
        serverVersion: currentVersion,
        clientTime: clientDate.toISOString(),
        serverTime: serverUpdatedAt.toISOString(),
      });
      throw new Error(
        `Conflict: Server has newer data (updated ${new Date(serverTime).toISOString()}). ` +
          `Your changes are from ${new Date(clientTime).toISOString()}. Please pull latest data.`
      );
    }
  }
}
