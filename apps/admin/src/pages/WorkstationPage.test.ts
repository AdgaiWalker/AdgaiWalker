import { describe, expect, it } from 'vitest';
import { adminNavGroups } from '../shared/nav';
import { ADMIN_ROUTES } from '../shared/routes';
import {
  WORKSTATION_FOUNDATIONS,
  WORKSTATION_PIPELINE,
} from './WorkstationPage';

describe('Workstation page', () => {
  it('has one stable route in the primary navigation', () => {
    expect(ADMIN_ROUTES.workstation).toBe('/workstation');
    expect(
      adminNavGroups.flatMap((group) => group.items).some(
        (item) => item.path === ADMIN_ROUTES.workstation,
      ),
    ).toBe(true);
  });

  it('marks the full MVP workflow as available', () => {
    expect(WORKSTATION_FOUNDATIONS.map((item) => item.status)).toEqual([
      'READY',
      'READY',
      'READY',
    ]);
    expect(WORKSTATION_PIPELINE.map((item) => item.status)).toEqual([
      'READY',
      'READY',
      'READY',
    ]);
  });
});
