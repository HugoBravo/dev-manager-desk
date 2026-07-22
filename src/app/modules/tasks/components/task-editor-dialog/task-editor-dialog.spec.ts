import { normalizeTaskDescription } from './task-editor-dialog';

describe('normalizeTaskDescription', () => {
  it('trims text and converts blank descriptions to null', () => {
    expect(normalizeTaskDescription('  Notes  ')).toBe('Notes');
    expect(normalizeTaskDescription('   ')).toBeNull();
  });
});
