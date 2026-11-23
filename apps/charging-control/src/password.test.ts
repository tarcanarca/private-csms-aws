import { describe, expect, it } from 'vitest';
import { generateStationPassword, hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const h = await hashPassword('s3cret');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('s3cret', h)).toBe(true);
    expect(await verifyPassword('s3cret ', h)).toBe(false);
  });
  it('salts: same password hashes differently', async () => {
    expect(await hashPassword('x')).not.toBe(await hashPassword('x'));
  });
  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
  it('generates 32 hex chars', () => {
    expect(generateStationPassword()).toMatch(/^[0-9a-f]{32}$/);
  });
});
