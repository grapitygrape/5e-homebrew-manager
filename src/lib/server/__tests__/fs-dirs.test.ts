import { describe, expect, it } from 'vitest';
import {
  _allowedBrowseRoots,
  _isWithinRoots,
} from '../../../routes/api/fs/dirs/+server';

describe('fs/dirs jailed directory browser', () => {
  it('defaults to /data and /foundry-data in container mode', () => {
    const roots = _allowedBrowseRoots({
      HBM_CONTAINER: '1',
    } as NodeJS.ProcessEnv);
    expect(roots).toEqual(['/data', '/foundry-data']);
  });

  it('allows paths inside allowed roots and rejects traversal outside', () => {
    const roots = ['/data', '/foundry-data'];
    expect(_isWithinRoots('/data', roots)).toBe(true);
    expect(_isWithinRoots('/data/repos/5e', roots)).toBe(true);
    expect(_isWithinRoots('/foundry-data/Data/modules', roots)).toBe(true);
    expect(_isWithinRoots('/etc/passwd', roots)).toBe(false);
    expect(_isWithinRoots('/data-other/foo', roots)).toBe(false);
  });
});
