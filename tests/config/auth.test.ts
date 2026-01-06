import { LightspeedAuth } from '../../src/config/auth';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LightspeedAuth', () => {
  let auth: LightspeedAuth;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      LIGHTSPEED_CLIENT_ID: 'test-client-id',
      LIGHTSPEED_CLIENT_SECRET: 'test-client-secret',
      LIGHTSPEED_REFRESH_TOKEN: 'test-refresh-token',
      LIGHTSPEED_ACCOUNT_ID: 'test-account-id',
      LIGHTSPEED_API_URL: 'https://api.test.com',
    };

    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    } as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('debe inicializar con credenciales válidas', () => {
      expect(() => {
        auth = new LightspeedAuth();
      }).not.toThrow();
    });

    it('debe lanzar error cuando faltan credenciales', () => {
      delete process.env.LIGHTSPEED_CLIENT_ID;
      expect(() => {
        new LightspeedAuth();
      }).toThrow('Faltan credenciales de Lightspeed');
    });
  });

  describe('getAccessToken', () => {
    beforeEach(() => {
      auth = new LightspeedAuth();
    });

    it('debe obtener token de acceso', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'test-access-token',
          expires_in: 3600,
        },
      };

      // Mock axios.post directamente porque refreshAccessToken lo usa
      mockedAxios.post.mockResolvedValue(mockTokenResponse as any);

      // Simular que no hay token guardado
      (auth as any).accessToken = null;
      (auth as any).tokenExpiresAt = null;

      const token = await (auth as any).getAccessToken();
      expect(token).toBe('test-access-token');
      expect(mockedAxios.post).toHaveBeenCalled();
    });

    it('debe refrescar token cuando está expirado', async () => {
      // Simular token expirado
      (auth as any).accessToken = 'old-token';
      (auth as any).tokenExpiresAt = Date.now() - 1000;

      const mockTokenResponse = {
        data: {
          access_token: 'new-access-token',
          expires_in: 3600,
        },
      };

      // Mock axios.post directamente porque refreshAccessToken lo usa
      mockedAxios.post.mockResolvedValue(mockTokenResponse as any);

      const token = await (auth as any).getAccessToken();
      expect(token).toBe('new-access-token');
      expect(mockedAxios.post).toHaveBeenCalled();
    });
  });

  describe('getAccountId', () => {
    it('debe retornar el account ID', () => {
      auth = new LightspeedAuth();
      expect(auth.getAccountId()).toBe('test-account-id');
    });
  });
});

