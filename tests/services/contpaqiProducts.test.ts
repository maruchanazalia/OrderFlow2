import { ContpaqiProductsService } from '../../src/services/contpaqiProducts';
import { AxiosInstance } from 'axios';

describe('ContpaqiProductsService', () => {
  let productsService: ContpaqiProductsService;
  let mockAxios: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    mockAxios = {
      get: jest.fn(),
    } as any;

    productsService = new ContpaqiProductsService(mockAxios);
  });

  describe('getProduct', () => {
    it('debe obtener producto por código', async () => {
      const mockResponse = {
        data: {
          CodigoProducto: 'PROD-001',
          Descripcion: 'Producto de prueba',
        },
      };

      mockAxios.get.mockResolvedValue(mockResponse as any);

      const result = await productsService.getProduct('PROD-001');
      expect(result).not.toBeNull();
      expect(result?.CodigoProducto).toBe('PROD-001');
      // El servicio usa axiosInstance.get, no mockAxios.get directamente
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('debe retornar null cuando el producto no existe', async () => {
      const error: any = new Error('Not found');
      error.response = { status: 404 };

      mockAxios.get.mockRejectedValue(error);

      const result = await productsService.getProduct('INVALID');
      expect(result).toBeNull();
    });

    it('debe lanzar error para otros errores', async () => {
      const error = new Error('Server error');
      mockAxios.get.mockRejectedValue(error);

      await expect(productsService.getProduct('PROD-001')).rejects.toThrow('Server error');
    });
  });

  describe('getProductExistencia', () => {
    it('debe obtener existencia de producto', async () => {
      const mockResponse = {
        data: {
          CodigoProducto: 'PROD-001',
          Existencia: 50,
        },
      };

      mockAxios.get.mockResolvedValue(mockResponse as any);

      const result = await productsService.getProductExistencia('PROD-001');
      expect(result).not.toBeNull();
      expect(result?.Existencia).toBe(50);
      // El servicio usa axiosInstance.get, no mockAxios.get directamente
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('debe retornar null cuando el producto no existe', async () => {
      const error: any = new Error('Not found');
      error.response = { status: 404 };

      mockAxios.get.mockRejectedValue(error);

      const result = await productsService.getProductExistencia('INVALID');
      expect(result).toBeNull();
    });
  });
});

