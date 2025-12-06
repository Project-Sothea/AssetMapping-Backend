import { EntityType, Form } from '@assetmapping/shared-types';

import { FormService } from '../../form.service';

import { BaseOperations } from './base.operations';

/**
 * Form Operations Service
 */
export class FormOperations extends BaseOperations<Form> {
  getEntityType(): EntityType {
    return 'form';
  }

  async getUpdatedAt(id: string): Promise<Date | null> {
    return FormService.getFormUpdatedAt(id);
  }

  async getVersion(id: string): Promise<number | null> {
    return FormService.getFormVersion(id);
  }

  async performUpsert(data: Form, version: number): Promise<Form> {
    return FormService.upsertForm(data, version);
  }

  async performDelete(id: string): Promise<void> {
    await FormService.deleteForm(id);
  }
}

export const formOperations = new FormOperations();
