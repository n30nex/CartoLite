import { describe, expect, it } from 'vitest';
import { EXPERIMENTS, experimentByID } from './registry';

describe('Labs experiment registry', () => {
  it('ships the requested gallery without Northern Lights', () => {
    expect(EXPERIMENTS.map((experiment) => experiment.id)).toEqual([
      'packet-pond',
      'firefly-meadow',
      'mesh-loom',
      'little-mesh-villages',
    ]);
  });

  it('falls back safely when an old Northern Lights deep link is opened', () => {
    expect(experimentByID('northern-lights').id).toBe('packet-pond');
  });
});
