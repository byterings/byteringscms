import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('builds URL slugs from titles', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('  Crème brûlée  recipe ')).toBe('creme-brulee-recipe');
    expect(slugify('---')).toBe('');
  });
});
