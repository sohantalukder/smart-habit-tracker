import { schema } from '../src/database/schema';
import { createHabit } from '../src/database/repository';
import packageJson from '../package.json';

jest.mock('uuid', () => ({
  v4: jest
    .fn()
    .mockReturnValueOnce('4245f96d-1a2b-4f3c-9d5e-112233445566')
    .mockReturnValueOnce('5245f96d-1a2b-4f3c-9d5e-112233445566'),
}));

const mockExecute = jest.fn().mockResolvedValue({ rows: [], rowsAffected: 1 });
const mockTransaction = jest.fn(
  async (work: (tx: { execute: typeof mockExecute }) => Promise<void>) =>
    work({ execute: mockExecute })
);

jest.mock('../src/database/database', () => ({
  currentDatabase: () => ({ transaction: mockTransaction }),
  first: jest.fn().mockResolvedValue(null),
  rows: jest.fn().mockResolvedValue([]),
}));

describe('Bloom offline database', () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockTransaction.mockClear();
  });

  it('defines every normalized offline table and the durable outbox', () => {
    const sql = schema
      .map((command) => command[0])
      .join('\n')
      .toLowerCase();
    for (const table of [
      'profile',
      'preferences',
      'habit_templates',
      'habits',
      'habit_logs',
      'journals',
      'prayer_logs',
      'habit_reminders',
      'prayer_reminders',
      'notifications',
      'onboarding_state',
      'tombstones',
      'pending_asset_uploads',
      'mutation_outbox',
    ]) {
      expect(sql).toContain(`table if not exists ${table}`);
    }
    expect(sql).toContain('coalesce_key text not null unique');
    expect(sql).toContain('pragma journal_mode = wal');
  });

  it('configures OP-SQLite with SQLCipher', () => {
    expect(packageJson['op-sqlite'].sqlcipher).toBe(true);
  });

  it('writes a visible habit and its outbox mutation atomically', async () => {
    await createHabit({
      name: 'Walk',
      icon: '🚶',
      category: 'steps',
      type: 'count',
      target: 5000,
      unit: 'steps',
      frequency: { kind: 'daily' },
      forgiving: false,
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockExecute.mock.calls[0]?.[0]).toContain('insert into habits');
    expect(mockExecute.mock.calls[1]?.[0]).toContain(
      'insert into mutation_outbox'
    );
    expect(mockExecute.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(['habit', '4245f96d-1a2b-4f3c-9d5e-112233445566'])
    );
  });
});
