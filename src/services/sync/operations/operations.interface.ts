import { OperationType } from '../../../types';

export interface IOperations<T> {
  syncEntity(operation: OperationType, data: T): Promise<T | { id: string; deleted: boolean }>;
}
