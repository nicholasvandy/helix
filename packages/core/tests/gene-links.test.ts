import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeneMap } from '../src/engine/gene-map.js';

describe('Gene Relationship Links (OPT-5)', () => {
  let gm: GeneMap;
  beforeEach(() => { gm = new GeneMap(':memory:'); });
  afterEach(() => { gm.close(); });

  it('records co-occurrence between two failures', () => {
    gm.recordCoOccurrence('verification-failed', 'signature', 'payment-insufficient', 'balance');
    const related = gm.getRelatedFailures('verification-failed', 'signature');
    expect(related.length).toBe(1);
    expect(related[0].code).toBe('payment-insufficient');
  });

  it('strengthens link on repeated co-occurrence', () => {
    gm.recordCoOccurrence('a', 'cat1', 'b', 'cat2');
    gm.recordCoOccurrence('a', 'cat1', 'b', 'cat2');
    gm.recordCoOccurrence('a', 'cat1', 'b', 'cat2');
    const related = gm.getRelatedFailures('a', 'cat1');
    expect(related[0].strength).toBeGreaterThan(0.5);
    expect(related[0].coOccurrences).toBe(3);
  });

  it('returns related from both directions', () => {
    gm.recordCoOccurrence('x', 'cat1', 'y', 'cat2');
    expect(gm.getRelatedFailures('x', 'cat1').length).toBe(1);
    expect(gm.getRelatedFailures('y', 'cat2').length).toBe(1);
  });

  it('normalizes order to avoid duplicates', () => {
    gm.recordCoOccurrence('a', 'c1', 'b', 'c2');
    gm.recordCoOccurrence('b', 'c2', 'a', 'c1');
    const related = gm.getRelatedFailures('a', 'c1');
    expect(related.length).toBe(1);
    expect(related[0].coOccurrences).toBe(2);
  });
});
