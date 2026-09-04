import { describe, expect, it } from 'vitest';
import { getDirectoryActionProposal, getReadableTriageReasoning } from './directoryActionProposal';

const reasoning = 'Local heuristic matched an identity ticket.\n\n[DIRECTORY_ACTION_PROPOSAL]\n{"action":"reset_password","target_sam_account_name":"jdoe","group_dns":[]}';

describe('directory action proposal parsing', () => {
  it('reads a persisted proposal for the approval form', () => {
    expect(getDirectoryActionProposal(reasoning)).toEqual({
      action: 'reset_password',
      target_sam_account_name: 'jdoe',
      group_dns: [],
    });
  });

  it('does not expose proposal JSON inside technician-facing reasoning', () => {
    expect(getReadableTriageReasoning(reasoning)).toBe('Local heuristic matched an identity ticket.');
  });
});
