process.env.DATABASE_URL = 'file:./dev.db';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

import { PrismaClient } from '@prisma/client';
import {
  register,
  login,
  signToken,
  verifyToken,
  encryptApiKey,
  decryptApiKey,
  hashPassword,
  verifyPassword,
} from '../../src/middleware/auth';

const prisma = new PrismaClient();

beforeAll(async () => {
  try { await prisma.finding.deleteMany(); } catch {}
  try { await prisma.file.deleteMany(); } catch {}
  try { await prisma.review.deleteMany(); } catch {}
  try { await prisma.user.deleteMany(); } catch {}
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Auth', () => {
  it('register creates user and returns JWT', async () => {
    const result = await register('test-auth@example.com', 'password123');
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('test-auth@example.com');
  });

  it('registration with duplicate email fails', async () => {
    await register('dup@example.com', 'pass123');
    await expect(register('dup@example.com', 'pass456')).rejects.toThrow('Email already registered');
  });

  it('login with correct password returns JWT', async () => {
    await register('login-test@example.com', 'mypassword');
    const result = await login('login-test@example.com', 'mypassword');
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('login-test@example.com');
  });

  it('login with wrong password returns error', async () => {
    await register('wrong-pw@example.com', 'correctpass');
    await expect(login('wrong-pw@example.com', 'wrongpass')).rejects.toThrow('Invalid email or password');
  });

  it('JWT with tampered payload is rejected', () => {
    const token = signToken({ userId: 'user1', email: 'test@example.com' });
    // Tamper with the token
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(verifyToken(tampered)).toBeNull();
  });

  it('JWT with valid token returns payload', () => {
    const token = signToken({ userId: 'user1', email: 'test@example.com' });
    const payload = verifyToken(token);
    expect(payload?.userId).toBe('user1');
    expect(payload?.email).toBe('test@example.com');
  });

  it('API key encryption/decryption roundtrip works', () => {
    const apiKey = 'sk-test-1234567890abcdef';
    const encrypted = encryptApiKey(apiKey);
    expect(encrypted).not.toBe(apiKey);
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(apiKey);
  });

  it('password hash and verify roundtrip works', async () => {
    const hash = await hashPassword('testpass');
    expect(await verifyPassword('testpass', hash)).toBe(true);
    expect(await verifyPassword('wrongpass', hash)).toBe(false);
  });
});
