import { UserAwareThrottlerGuard } from './user-aware-throttler.guard';

describe('UserAwareThrottlerGuard', () => {
  let guard: UserAwareThrottlerGuard;

  beforeEach(() => {
    // Create instance with minimal prototype — getTracker is a plain method
    guard = Object.create(UserAwareThrottlerGuard.prototype);
  });

  describe('getTracker', () => {
    it('should return user:sub when user is authenticated', async () => {
      const req = { user: { sub: 'user-1' } };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:user-1');
    });

    it('should return IP when user is not present', async () => {
      const req = { ip: '192.168.1.1' };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('192.168.1.1');
    });

    it('should return "unknown" when neither user nor IP', async () => {
      const req = {};
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('unknown');
    });

    it('should fall back to IP when user has no sub', async () => {
      const req = { user: {}, ip: '10.0.0.1' };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('10.0.0.1');
    });
  });
});
