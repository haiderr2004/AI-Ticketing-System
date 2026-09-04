import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildDirectoryAccountUrl,
  isComposedWorkspace,
  isValidSamAccountName,
  normalizeAppBasePath,
  resolveDirectoryServiceUrl,
  resolveDirectoryWorkspaceUrl,
  resolveTicketApiBase,
  routerBasename,
} from './workspaceNavigation';

describe('workspace navigation', () => {
  it('normalizes standalone and composed router bases', () => {
    expect(normalizeAppBasePath('/')).toBe('/');
    expect(normalizeAppBasePath('tickets')).toBe('/tickets/');
    expect(routerBasename('/tickets/')).toBe('/tickets');
    expect(isComposedWorkspace('/tickets/')).toBe(true);
  });

  it('keeps standalone API defaults and selects the composed ticket prefix', () => {
    expect(resolveTicketApiBase('', '/')).toBe('/api');
    expect(resolveTicketApiBase('', '/tickets/')).toBe('/ticket-api');
    expect(resolveTicketApiBase('https://tickets.example/api/', '/tickets/')).toBe('https://tickets.example/api');
  });

  it('uses MissionControl directly when standalone and the shared origin when composed', () => {
    expect(resolveDirectoryServiceUrl('', '/')).toBe('http://localhost:8000');
    expect(resolveDirectoryServiceUrl('', '/tickets/', 'https://workspace.example')).toBe('https://workspace.example');
    expect(resolveDirectoryWorkspaceUrl('', '/')).toBe('http://localhost:8000/');
    expect(resolveDirectoryWorkspaceUrl('', '/tickets/')).toBe('/');
  });

  it('builds a fragment-only account handoff with an optional numeric ticket return', () => {
    expect(buildDirectoryAccountUrl('/', 'jsmith')).toBe('/#account=jsmith');
    expect(buildDirectoryAccountUrl('/', 'jsmith', 5)).toBe('/#account=jsmith&ticket=5');
    expect(buildDirectoryAccountUrl('http://localhost:8000', 'test.user-1')).toBe('http://localhost:8000/#account=test.user-1');
    expect(buildDirectoryAccountUrl('/', 'Jane Smith')).toBeNull();
    expect(buildDirectoryAccountUrl('/', 'jsmith?return=/tickets/1')).toBeNull();
    expect(buildDirectoryAccountUrl('/', 'jsmith', '5?next=/')).toBe('/#account=jsmith');
    expect(isValidSamAccountName('test.user-1')).toBe(true);
    expect(isValidSamAccountName('Jane Smith')).toBe(false);
  });

  it('keeps navigation keyboard-visible and never embeds MissionControl in an iframe', () => {
    const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    const actionPanelSource = readFileSync(new URL('../components/DirectoryActionPanel.jsx', import.meta.url), 'utf8');
    const contextSource = readFileSync(new URL('../components/TicketDirectorySummary.jsx', import.meta.url), 'utf8');

    expect(appSource).toContain('aria-label="Primary workspace"');
    expect(appSource).toContain('AD MissionControl');
    expect(appSource).toContain('>Directory</a>');
    expect(appSource).toContain('>Tickets</Link>');
    expect(appSource).toContain('aria-label={collapsed ? \'Expand navigation\' : \'Collapse navigation\'}');
    expect(appSource).toContain('tabIndex="-1"');
    expect(contextSource).toContain('View in Directory');
    expect(`${appSource}\n${actionPanelSource}\n${contextSource}`).not.toMatch(/<iframe/i);
  });
});
