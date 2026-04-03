import { describe, it, expect } from 'vitest';
import { classifyTask } from '../src/engine/task-classifier.js';

describe('Task Classifier', () => {
  it('classifies debug tasks', () => {
    expect(classifyTask('fix the nonce mismatch bug')).toBe('debug');
    expect(classifyTask('debug why tests are failing')).toBe('debug');
  });

  it('classifies write_code tasks', () => {
    expect(classifyTask('implement a budget predictor module')).toBe('write_code');
    expect(classifyTask('create a new REST endpoint')).toBe('write_code');
  });

  it('classifies write_test tasks', () => {
    expect(classifyTask('write tests for the classifier')).toBe('write_test');
    expect(classifyTask('add vitest spec for gene map')).toBe('write_test');
  });

  it('classifies write_docs tasks', () => {
    expect(classifyTask('update the README with new features')).toBe('write_docs');
  });

  it('classifies refactor tasks', () => {
    expect(classifyTask('refactor the PCEC engine')).toBe('refactor');
  });

  it('classifies analysis tasks', () => {
    expect(classifyTask('analyze the competitor codebase')).toBe('analysis');
  });

  it('classifies deploy tasks', () => {
    expect(classifyTask('deploy to railway production')).toBe('deploy');
    expect(classifyTask('npm publish the package')).toBe('deploy');
  });

  it('classifies content tasks', () => {
    expect(classifyTask('write a blog post about agents')).toBe('content');
  });

  it('returns general for unrecognized', () => {
    expect(classifyTask('hello world')).toBe('general');
    expect(classifyTask('')).toBe('general');
  });
});
