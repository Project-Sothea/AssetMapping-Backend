import { supabase } from '../config/supabase';
import { DomainEvent } from '../types/events';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface OutboxRecord {
  id: string;
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  version: number;
  payload: DomainEvent;
  created_at: string;
  published_at: string | null;
  retry_count: number;
  error: string | null;
}

export class OutboxRepository {
  /**
   * Insert an event into the outbox (called within same transaction as aggregate update)
   */
  async insertEvent(event: DomainEvent): Promise<void> {
    const { error } = await supabase.from('outbox').insert({
      id: uuidv4(),
      aggregate_id: event.aggregateId,
      aggregate_type: event.aggregateType,
      event_type: event.type,
      version: event.version,
      payload: event,
      created_at: new Date().toISOString(),
      published_at: null,
      retry_count: 0,
    });

    if (error) {
      logger.error('Failed to insert event to outbox', { error, event });
      throw new Error(`Outbox insert failed: ${error.message}`);
    }

    logger.debug('Event inserted to outbox', {
      eventId: event.eventId,
      type: event.type,
      aggregateId: event.aggregateId,
    });
  }

  /**
   * Get unpublished events (for the outbox relayer)
   */
  async getUnpublishedEvents(limit: number = 100): Promise<OutboxRecord[]> {
    const { data, error } = await supabase
      .from('outbox')
      .select('*')
      .is('published_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error('Failed to fetch unpublished events', { error });
      throw new Error(`Outbox query failed: ${error.message}`);
    }

    return (data as OutboxRecord[]) || [];
  }

  /**
   * Mark event as published
   */
  async markAsPublished(eventId: string): Promise<void> {
    const { error } = await supabase
      .from('outbox')
      .update({
        published_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (error) {
      logger.error('Failed to mark event as published', { error, eventId });
      throw new Error(`Outbox update failed: ${error.message}`);
    }
  }

  /**
   * Increment retry count and record error
   */
  async recordFailure(eventId: string, errorMessage: string): Promise<void> {
    // First, get current retry count
    const { data: current, error: fetchError } = await supabase
      .from('outbox')
      .select('retry_count')
      .eq('id', eventId)
      .single();

    if (fetchError) {
      logger.error('Failed to fetch outbox event for retry increment', {
        error: fetchError,
        eventId,
      });
      return;
    }

    const newRetryCount = (current?.retry_count || 0) + 1;

    const { error } = await supabase
      .from('outbox')
      .update({
        retry_count: newRetryCount,
        error: errorMessage,
      })
      .eq('id', eventId);

    if (error) {
      logger.error('Failed to record outbox failure', { error, eventId });
    }
  }

  /**
   * Clean up old published events (retention policy)
   */
  async cleanupOldEvents(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { data, error } = await supabase
      .from('outbox')
      .delete()
      .not('published_at', 'is', null)
      .lt('published_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      logger.error('Failed to cleanup old outbox events', { error });
      return 0;
    }

    const count = data?.length || 0;
    logger.info(`Cleaned up ${count} old outbox events`);
    return count;
  }
}

export const outboxRepository = new OutboxRepository();
