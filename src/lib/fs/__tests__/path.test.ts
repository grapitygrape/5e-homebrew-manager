import { describe, expect, it } from 'vitest';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  resolve,
} from '../path.ts';

describe('isAbsolute', () => {
  it('knows drive, UNC and posix roots from relative paths', () => {
    expect(isAbsolute('C:/web')).toBe(true);
    expect(isAbsolute('C:\\repos\\5e')).toBe(true);
    expect(isAbsolute('\\\\nas\\share\\x')).toBe(true);
    expect(isAbsolute('/home/user')).toBe(true);
    expect(isAbsolute('homebrew')).toBe(false);
    expect(isAbsolute('./guides')).toBe(false);
  });
});

describe('normalize / join', () => {
  it('emits forward slashes and collapses . and ..', () => {
    expect(join('C:\\repos\\5e', 'data', '..', 'homebrew')).toBe(
      'C:/repos/5e/homebrew',
    );
    expect(normalize('a//b/./c/')).toBe('a/b/c');
  });

  it('never climbs above an absolute root', () => {
    expect(normalize('C:/../..')).toBe('C:/');
    expect(normalize('//nas/share/../x')).toBe('//nas/share/x');
  });

  it('keeps leading .. on relative paths', () => {
    expect(normalize('../a/../../b')).toBe('../../b');
  });
});

describe('resolve', () => {
  it('joins onto the root until an absolute part takes over', () => {
    expect(resolve('C:/app', 'homebrew')).toBe('C:/app/homebrew');
    expect(resolve('C:/app', 'D:\\brew', 'x.json')).toBe('D:/brew/x.json');
  });

  it('walks up from a data root to a sibling checkout', () => {
    expect(resolve('C:/repos/5e/data', '..', '..', '5etools-homebrew')).toBe(
      'C:/repos/5etools-homebrew',
    );
  });
});

describe('dirname / basename', () => {
  it('splits either separator', () => {
    expect(dirname('C:\\repos\\5e\\data\\x.json')).toBe('C:/repos/5e/data');
    expect(dirname('C:/x.json')).toBe('C:/');
    expect(dirname('x.json')).toBe('.');
    expect(basename('C:\\repos\\Brew; Name.json')).toBe('Brew; Name.json');
    expect(basename('a/b/')).toBe('b');
  });

  it('strips directories smuggled into a filename', () => {
    expect(basename('..\\..\\evil.json')).toBe('evil.json');
  });
});
