/**
 * Classifies a prompt into a task type category.
 * Phase 1: keyword matching (8 categories).
 */

export type TaskType =
  | 'write_code'
  | 'debug'
  | 'write_test'
  | 'write_docs'
  | 'refactor'
  | 'analysis'
  | 'deploy'
  | 'content'
  | 'general';

const PATTERNS: Array<{ type: TaskType; keywords: RegExp }> = [
  { type: 'debug',      keywords: /\b(fix|bug|error|debug|broken|issue|fail|crash|wrong)\b/i },
  { type: 'write_test', keywords: /\b(tests?|spec|vitest|jest|expect|assert|coverage)\b/i },
  { type: 'write_docs', keywords: /\b(doc|readme|comment|jsdoc|changelog|guide|tutorial)\b/i },
  { type: 'refactor',   keywords: /\b(refactor|clean|rename|reorganize|simplify|extract|move)\b/i },
  { type: 'analysis',   keywords: /\b(analyze|compare|review|audit|benchmark|evaluate|assess)\b/i },
  { type: 'deploy',     keywords: /\b(deploy|publish|release|ci|cd|docker|railway|npm\s+publish)\b/i },
  { type: 'content',    keywords: /\b(blog|email|post|article|pitch|deck|presentation|copy)\b/i },
  { type: 'write_code', keywords: /\b(write|create|implement|add|build|make|generate|new)\b/i },
];

export function classifyTask(prompt: string): TaskType {
  const prefix = prompt.slice(0, 300);
  for (const { type, keywords } of PATTERNS) {
    if (keywords.test(prefix)) return type;
  }
  return 'general';
}
