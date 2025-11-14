import { FormData } from '../../../types';
import { FormService } from '../../form.service';
import { BaseOperations, EntityType } from './base.operations';

/**
 * Form Operations Service
 */
export class FormOperations extends BaseOperations<FormData> {
  getEntityType(): EntityType {
    return 'forms';
  }

  async getUpdatedAt(id: string): Promise<string | null> {
    return FormService.getFormUpdatedAt(id);
  }

  async getVersion(id: string): Promise<number | null> {
    return FormService.getFormVersion(id);
  }

  async performUpsert(data: FormData, version: number): Promise<FormData> {
    return FormService.upsertForm(data, version);
  }

  async performDelete(id: string): Promise<void> {
    await FormService.deleteForm(id);
  }
}

export const formOperations = new FormOperations();
