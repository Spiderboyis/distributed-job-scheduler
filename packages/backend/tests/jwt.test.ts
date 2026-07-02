import { describe, it, expect } from 'vitest';
import { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken } from '../src/utils/jwt.js';

describe('JWT Utilities', () => {
  const testPayload = { userId: 'test-user-id-123', email: 'test@example.com' };

  describe('generateAccessToken', () => {
    it('should generate a valid JWT string', () => {
      const token = generateAccessToken(testPayload);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify and decode a valid token', () => {
      const token = generateAccessToken(testPayload);
      const decoded = verifyAccessToken(token);
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
    });

    it('should throw on invalid token', () => {
      expect(() => verifyAccessToken('invalid.token.here')).toThrow();
    });

    it('should throw on tampered token', () => {
      const token = generateAccessToken(testPayload);
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyAccessToken(tampered)).toThrow();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a different token than access token', () => {
      const access = generateAccessToken(testPayload);
      const refresh = generateRefreshToken(testPayload);
      expect(access).not.toBe(refresh);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify refresh token', () => {
      const token = generateRefreshToken(testPayload);
      const decoded = verifyRefreshToken(token);
      expect(decoded.userId).toBe(testPayload.userId);
    });

    it('should reject access token used as refresh token', () => {
      const accessToken = generateAccessToken(testPayload);
      expect(() => verifyRefreshToken(accessToken)).toThrow();
    });
  });
});
