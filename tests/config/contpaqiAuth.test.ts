import { ContpaqiAuth } from '../../src/config/contpaqiAuth';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ContpaqiAuth', () => {
  let auth: ContpaqiAuth;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      CONTAPAQI_API_URL: 'https://demo.arxsoftware.cloud',
      CONTAPAQI_USERNAME: 'DEMO',
      CONTAPAQI_PASSWORD: 'password123',
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
        auth = new ContpaqiAuth();
      }).not.toThrow();
    });

    it('debe lanzar error cuando faltan credenciales', () => {
      delete process.env.CONTAPAQI_USERNAME;
      expect(() => {
        new ContpaqiAuth();
      }).toThrow();
    });
  });

  describe('authenticate', () => {
    beforeEach(() => {
      auth = new ContpaqiAuth();
    });

    it('debe autenticar exitosamente con token como string', async () => {
      const mockResponse = {
        data: 'jwt-token-string',
        status: 200,
        statusText: 'OK',
      };

      // Mock axios.post directamente porque authenticate lo usa
      mockedAxios.post.mockResolvedValue(mockResponse as any);

      await (auth as any).authenticate();
      // authenticate() guarda el token en this.jwtToken, no lo retorna
      expect((auth as any).jwtToken).toBe('jwt-token-string');
    });

    it('debe autenticar exitosamente con token como objeto', async () => {
      const mockResponse = {
        data: {
          token: 'jwt-token-object',
        },
        status: 200,
        statusText: 'OK',
      };

      // Mock axios.post directamente porque authenticate lo usa
      mockedAxios.post.mockResolvedValue(mockResponse as any);

      await (auth as any).authenticate();
      // authenticate() guarda el token en this.jwtToken, no lo retorna
      expect((auth as any).jwtToken).toBe('jwt-token-object');
    });

    it('debe manejar error 401', async () => {
      const error: any = new Error('Unauthorized');
      error.response = { status: 401 };

      // Mock axios.post directamente porque authenticate lo usa
      mockedAxios.post.mockResolvedValue({
        data: null,
        status: 401,
      } as any);

      await expect((auth as any).authenticate()).rejects.toThrow();
    });
  });

  describe('getJwtToken', () => {
    beforeEach(() => {
      auth = new ContpaqiAuth();
    });

    it('debe retornar token existente si no está expirado', async () => {
      (auth as any).jwtToken = 'existing-token';
      (auth as any).tokenExpiresAt = Date.now() + 3600000; // 1 hora en el futuro

      const token = await auth.getJwtToken();
      expect(token).toBe('existing-token');
    });

    it('debe autenticar cuando el token está expirado', async () => {
      (auth as any).jwtToken = null;
      (auth as any).tokenExpiresAt = Date.now() - 1000; // Expirado

      const mockResponse = {
        data: 'new-token',
        status: 200,
      };

      // Mock axios.post directamente porque authenticate lo usa
      mockedAxios.post.mockResolvedValue(mockResponse as any);

      const token = await auth.getJwtToken();
      expect(token).toBe('new-token');
    });
  });
});

