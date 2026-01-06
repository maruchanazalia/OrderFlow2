import { InventoryService } from '../../src/services/inventory';
import { AxiosInstance } from 'axios';

describe('InventoryService', () => {
  let inventoryService: InventoryService;
  let mockAxios: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    mockAxios = {
      get: jest.fn(),
    } as any;

    inventoryService = new InventoryService(mockAxios, 'test-account-id');
  });

  describe('getAllInventory', () => {
    it('debe obtener inventario sin filtros', async () => {
      const mockResponse = {
        Inventory: [
          { itemID: '1', qoh: '10' },
          { itemID: '2', qoh: '20' },
        ],
      };

      (inventoryService as any).getAllPaginated = jest.fn().mockResolvedValue(mockResponse.Inventory);

      const result = await inventoryService.getAllInventory();
      expect(result).toHaveLength(2);
      expect((inventoryService as any).getAllPaginated).toHaveBeenCalledWith(
        '/Account/test-account-id/Inventory.json',
        {}
      );
    });

    it('debe usar updatedSince cuando se proporciona', async () => {
      const mockResponse = {
        Inventory: [{ itemID: '1', qoh: '10' }],
      };

      (inventoryService as any).getAllPaginated = jest.fn().mockResolvedValue(mockResponse.Inventory);

      await inventoryService.getAllInventory('2025-01-01T00:00:00Z');
      expect((inventoryService as any).getAllPaginated).toHaveBeenCalledWith(
        '/Account/test-account-id/Inventory.json',
        { timeStamp: '>,2025-01-01T00:00:00Z' }
      );
    });
  });

  describe('getItemInventory', () => {
    it('debe obtener inventario de un item específico', async () => {
      const mockResponse = {
        Inventory: { itemID: '1', qoh: '10' },
      };

      (inventoryService as any).get = jest.fn().mockResolvedValue(mockResponse);

      const result = await inventoryService.getItemInventory('1');
      expect(result).toEqual(mockResponse.Inventory);
      expect((inventoryService as any).get).toHaveBeenCalledWith(
        '/Account/test-account-id/Item/1/Inventory.json'
      );
    });

    it('debe manejar inventario como array', async () => {
      const mockResponse = {
        Inventory: [{ itemID: '1', qoh: '10' }],
      };

      (inventoryService as any).get = jest.fn().mockResolvedValue(mockResponse);

      const result = await inventoryService.getItemInventory('1');
      expect(result).toEqual(mockResponse.Inventory[0]);
    });

    it('debe retornar null cuando el item no existe', async () => {
      const error: any = new Error('Not found');
      error.response = { status: 404 };

      (inventoryService as any).get = jest.fn().mockRejectedValue(error);

      const result = await inventoryService.getItemInventory('999');
      expect(result).toBeNull();
    });

    it('debe lanzar error para otros errores', async () => {
      const error = new Error('Server error');
      (inventoryService as any).get = jest.fn().mockRejectedValue(error);

      await expect(inventoryService.getItemInventory('1')).rejects.toThrow('Server error');
    });
  });

  describe('syncInventory', () => {
    it('debe sincronizar inventario correctamente', async () => {
      const mockInventory = [
        { itemID: '1', qoh: '10' },
        { itemID: '2', qoh: '20' },
      ];

      (inventoryService as any).getAllInventory = jest.fn().mockResolvedValue(mockInventory);

      const result = await inventoryService.syncInventory();
      expect(result).toEqual(mockInventory);
    });

    it('debe pasar updatedSince a getAllInventory', async () => {
      const mockInventory = [{ itemID: '1', qoh: '10' }];
      (inventoryService as any).getAllInventory = jest.fn().mockResolvedValue(mockInventory);

      await inventoryService.syncInventory('2025-01-01T00:00:00Z');
      expect((inventoryService as any).getAllInventory).toHaveBeenCalledWith('2025-01-01T00:00:00Z');
    });
  });
});

