import { BaseService } from '../../src/services/base';
import { AxiosInstance } from 'axios';

describe('BaseService', () => {
  let baseService: BaseService;
  let mockAxios: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    mockAxios = {
      get: jest.fn(),
    } as any;

    baseService = new BaseService(mockAxios, 'test-account-id');
  });

  describe('rateLimit', () => {
    it('debe permitir requests dentro del límite', async () => {
      const startTime = Date.now();
      await (baseService as any).rateLimit();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });

    it('debe manejar rate limiting correctamente', async () => {
      const service = new BaseService(mockAxios, 'test-account-id');
      
      // Verificar que rateLimiter se inicializa correctamente
      expect((service as any).rateLimiter).toBeDefined();
      expect((service as any).rateLimiter.maxRequests).toBeGreaterThan(0);
      expect((service as any).rateLimiter.windowMs).toBe(1000);
      
      // Ejecutar rateLimit una vez (debe pasar sin problemas)
      await (service as any).rateLimit();
      expect((service as any).rateLimiter.requests.length).toBe(1);
    });

    it('debe esperar si se superan 299 req/s', async () => {
      const service = new BaseService(mockAxios, 'test-account-id');
      const rateLimiter = (service as any).rateLimiter;

      // Simular 299 solicitudes en el último segundo
      const now = Date.now();
      rateLimiter.requests = Array.from({ length: 299 }, () => now - 10);

      const sleepSpy = jest
        .spyOn(service as any, 'sleep')
        .mockImplementation(async (ms: number) => {
          expect(ms).toBeGreaterThan(0);
          // Avanzar el estado como si hubieran pasado los ms
          rateLimiter.requests = [Date.now() - 2000];
        });

      await (service as any).rateLimit();

      expect(sleepSpy).toHaveBeenCalled();
      expect(rateLimiter.requests.length).toBe(1);

      sleepSpy.mockRestore();
    });
  });

  describe('getAllPaginated', () => {
    it('debe manejar respuesta sin paginación', async () => {
      const mockResponse = {
        Sale: [
          { saleID: '1' },
          { saleID: '2' },
        ],
      };

      (baseService as any).get = jest.fn().mockResolvedValue(mockResponse);

      const result = await (baseService as any).getAllPaginated('/test.json');
      expect(result).toHaveLength(2);
    });

    it('debe manejar paginación con @next', async () => {
      const firstResponse = {
        Sale: [{ saleID: '1' }],
        '@next': 'https://api.test.com/test.json?offset=100',
      };

      const secondResponse = {
        Sale: [{ saleID: '2' }],
      };

      (baseService as any).get = jest
        .fn()
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(secondResponse);

      const result = await (baseService as any).getAllPaginated('/test.json');
      expect(result).toHaveLength(2);
      expect((baseService as any).get).toHaveBeenCalledTimes(2);
    });

    it('debe manejar paginación con múltiples páginas', async () => {
      const responses = [
        {
          Sale: [{ saleID: '1' }],
          '@next': 'https://api.test.com/test.json?offset=100',
        },
        {
          Sale: [{ saleID: '2' }],
          '@next': 'https://api.test.com/test.json?offset=200',
        },
        {
          Sale: [{ saleID: '3' }],
        },
      ];

      (baseService as any).get = jest
        .fn()
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
        .mockResolvedValueOnce(responses[2]);

      const result = await (baseService as any).getAllPaginated('/test.json');
      expect(result).toHaveLength(3);
      expect((baseService as any).get).toHaveBeenCalledTimes(3);
    });
  });
});

