import { CatalogService } from '../../src/services/catalog';
import { AxiosInstance } from 'axios';

describe('CatalogService', () => {
  let catalogService: CatalogService;
  let mockAxios: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    mockAxios = {
      get: jest.fn(),
    } as any;

    catalogService = new CatalogService(mockAxios, 'test-account-id');
  });

  describe('getAllCategories', () => {
    it('debe obtener todas las categorías', async () => {
      const mockCategories = [
        { categoryID: '1', name: 'Categoría 1' },
        { categoryID: '2', name: 'Categoría 2' },
      ];

      (catalogService as any).getAllPaginated = jest.fn().mockResolvedValue(mockCategories);

      const result = await catalogService.getAllCategories();
      expect(result).toEqual(mockCategories);
      expect((catalogService as any).getAllPaginated).toHaveBeenCalledWith(
        '/Account/test-account-id/Category.json',
        {}
      );
    });

    it('debe usar updatedSince cuando se proporciona', async () => {
      const mockCategories = [{ categoryID: '1', name: 'Categoría 1' }];
      (catalogService as any).getAllPaginated = jest.fn().mockResolvedValue(mockCategories);

      await catalogService.getAllCategories('2025-01-01T00:00:00Z');
      expect((catalogService as any).getAllPaginated).toHaveBeenCalledWith(
        '/Account/test-account-id/Category.json',
        { timeStamp: '>,2025-01-01T00:00:00Z' }
      );
    });
  });

  describe('getAllItemMatrices', () => {
    it('debe obtener todas las matrices de items', async () => {
      const mockMatrices = [
        { itemMatrixID: '1', description: 'Matrix 1' },
        { itemMatrixID: '2', description: 'Matrix 2' },
      ];

      (catalogService as any).getAllPaginated = jest.fn().mockResolvedValue(mockMatrices);

      const result = await catalogService.getAllItemMatrices();
      expect(result).toEqual(mockMatrices);
      expect((catalogService as any).getAllPaginated).toHaveBeenCalledWith(
        '/Account/test-account-id/ItemMatrix.json',
        {}
      );
    });
  });

  describe('getAllItems', () => {
    it('debe obtener todos los items', async () => {
      const mockItems = [
        { itemID: '1', systemSku: 'SKU-001' },
        { itemID: '2', systemSku: 'SKU-002' },
      ];

      (catalogService as any).getAllPaginated = jest.fn().mockResolvedValue(mockItems);

      const result = await catalogService.getAllItems();
      expect(result).toEqual(mockItems);
      expect((catalogService as any).getAllPaginated).toHaveBeenCalledWith(
        '/Account/test-account-id/Item.json',
        {}
      );
    });
  });

  describe('syncAllCatalogs', () => {
    it('debe sincronizar todos los catálogos', async () => {
      const mockCategories = [{ categoryID: '1' }];
      const mockMatrices = [{ itemMatrixID: '1' }];
      const mockItems = [{ itemID: '1' }];

      jest.spyOn(catalogService, 'getAllCategories').mockResolvedValue(mockCategories);
      jest.spyOn(catalogService, 'getAllItemMatrices').mockResolvedValue(mockMatrices);
      jest.spyOn(catalogService, 'getAllItems').mockResolvedValue(mockItems);

      const result = await catalogService.syncAllCatalogs();

      expect(result.categories).toEqual(mockCategories);
      expect(result.itemMatrices).toEqual(mockMatrices);
      expect(result.items).toEqual(mockItems);
    });
  });

  describe('syncUpdatedCatalogs', () => {
    it('debe sincronizar catálogos actualizados', async () => {
      const mockCategories = [{ categoryID: '1' }];
      const mockMatrices = [{ itemMatrixID: '1' }];
      const mockItems = [{ itemID: '1' }];

      jest.spyOn(catalogService, 'getAllCategories').mockResolvedValue(mockCategories);
      jest.spyOn(catalogService, 'getAllItemMatrices').mockResolvedValue(mockMatrices);
      jest.spyOn(catalogService, 'getAllItems').mockResolvedValue(mockItems);

      const result = await catalogService.syncUpdatedCatalogs('2025-01-01T00:00:00Z');

      expect(result.categories).toEqual(mockCategories);
      expect(result.itemMatrices).toEqual(mockMatrices);
      expect(result.items).toEqual(mockItems);

      expect(catalogService.getAllCategories).toHaveBeenCalledWith('2025-01-01T00:00:00Z');
      expect(catalogService.getAllItemMatrices).toHaveBeenCalledWith('2025-01-01T00:00:00Z');
      expect(catalogService.getAllItems).toHaveBeenCalledWith('2025-01-01T00:00:00Z');
    });
  });
});
