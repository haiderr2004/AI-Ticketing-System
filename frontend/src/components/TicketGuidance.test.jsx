import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TicketGuidance from './TicketGuidance';


describe('TicketGuidance', () => {
  it('renders approved citations and escapes untrusted guidance text', () => {
    const html = renderToStaticMarkup(
      <TicketGuidance
        guidance={{
          evidence_status: 'supported',
          recommended_checks: [{
            step: '<script>alert("unsafe")</script>',
            citation: { article_id: 'KB-ACCESS-002', title: 'Handle password reset requests', version: '1.0' },
          }],
          notice: 'Guidance is advisory.',
        }}
      />,
    );

    expect(html).toContain('KB-ACCESS-002');
    expect(html).toContain('Handle password reset requests');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows a safe degraded state without exposing provider details', () => {
    const html = renderToStaticMarkup(<TicketGuidance error={new Error('secret provider response')} />);

    expect(html).toContain('Guidance is temporarily unavailable');
    expect(html).not.toContain('secret provider response');
  });
});
