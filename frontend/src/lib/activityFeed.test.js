import { describe, expect, it } from 'vitest';
import { normalizeActivityEntry, redactMetadata } from './activityFeed';

describe('activity feed normalization', () => {
  it('maps native event descriptions and removes unsafe metadata', () => {
    const entry = normalizeActivityEntry({
      source: 'ad_security', source_id: 'DC1:8', occurred_at: '2026-09-04T10:00:00Z',
      collected_at: '2026-09-04T10:01:00Z', raw_code: '4724', result: 'informational',
      target_account: 'jdoe', safe_metadata: { domain_controller: 'HOMELAB-DC', event_record_id: 8, password: 'nope' },
    }, 'ad_security');
    expect(entry.description).toBe('Password reset was recorded for jdoe on HOMELAB-DC.');
    expect(entry.safeMetadata).not.toHaveProperty('password');
  });

  it('renders unknown portal codes safely and never treats them as success', () => {
    const entry = normalizeActivityEntry({ source: 'portal_audit', raw_code: 'NEW_ACTION', result: 'bad-value' }, 'portal_audit');
    expect(entry.description).toBe('Portal audit event: NEW_ACTION.');
    expect(entry.result).toBe('unknown');
  });

  it('uses deterministic ticket action descriptions and a strict ticket id', () => {
    const entry = normalizeActivityEntry({ source: 'ticketing', raw_code: 'DIRECTORY_ACTION_OUTCOME_UNKNOWN', ticket_id: 4, result: 'unknown', target_account: 'testuser1' }, 'ticketing');
    expect(entry.description).toContain('outcome is unknown');
    expect(entry.ticketId).toBe(4);
  });

  it('redacts nested, free-form, and sensitive metadata', () => {
    expect(redactMetadata({ ticket_id: 2, group_dn: 'CN=Secret', error: { message: 'raw' }, action: 'ADD_GROUP' })).toEqual({ ticket_id: 2, action: 'ADD_GROUP' });
  });
});
