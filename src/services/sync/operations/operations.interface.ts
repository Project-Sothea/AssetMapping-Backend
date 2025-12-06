import { OperationType } from '@assetmapping/shared-types';

export interface IOperations<T> {
  syncEntity(operation: OperationType, data: T): Promise<T | { id: string; deleted: boolean }>;
}
