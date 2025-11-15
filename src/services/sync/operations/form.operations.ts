import { EntityType, FormData } from '../../../types';
import { FormService } from '../../form.service';
import { BaseOperations } from './base.operations';

/**
 * Form Operations Service
 */
export class FormOperations extends BaseOperations<FormData> {
  getEntityType(): EntityType {
    return 'form';
  }

  async getUpdatedAt(id: string): Promise<Date | null> {
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
