import { PurchasesService } from '../../src/services/purchases';
import { AxiosInstance } from 'axios';

describe('PurchasesService', () => {
  let purchasesService: PurchasesService;
  let mockAxios: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    mockAxios = {
      get: jest.fn(),
    } as any;

    purchasesService = new PurchasesService(mockAxios, 'test-account-id');
  });

  describe('getAllPurchaseOrders', () => {
    it('debe obtener todas las órdenes de compra', async () => {
      const mockOrders = [
        { purchaseOrderID: '1', purchaseOrderNumber: 'PO-001' },
        { purchaseOrderID: '2', purchaseOrderNumber: 'PO-002' },
      ];

      (purchasesService as any).getAllPaginated = jest.fn().mockResolvedValue(mockOrders);

      const result = await purchasesService.getAllPurchaseOrders();
      expect(result).toEqual(mockOrders);
      expect((purchasesService as any).getAllPaginated).toHaveBeenCalledWith(
        '/Account/test-account-id/PurchaseOrder.json',
        {}
      );
    });

    it('debe usar updatedSince cuando se proporciona', async () => {
      const mockOrders = [{ purchaseOrderID: '1' }];
      (purchasesService as any).getAllPaginated = jest.fn().mockResolvedValue(mockOrders);

      await purchasesService.getAllPurchaseOrders('2025-01-01T00:00:00Z');
      expect((purchasesService as any).getAllPaginated).toHaveBeenCalledWith(
        '/Account/test-account-id/PurchaseOrder.json',
        { timeStamp: '>,2025-01-01T00:00:00Z' }
      );
    });

    it('debe retornar array vacío cuando el endpoint no existe (404)', async () => {
      const error: any = new Error('Not found');
      error.response = { status: 404 };
      error.status = 404;

      (purchasesService as any).getAllPaginated = jest.fn().mockRejectedValue(error);

      const result = await purchasesService.getAllPurchaseOrders();
      expect(result).toEqual([]);
    });

    it('debe lanzar error para otros errores', async () => {
      const error = new Error('Server error');
      (purchasesService as any).getAllPaginated = jest.fn().mockRejectedValue(error);

      await expect(purchasesService.getAllPurchaseOrders()).rejects.toThrow('Server error');
    });
  });

  describe('getPurchaseOrder', () => {
    it('debe obtener una orden de compra específica', async () => {
      const mockResponse = {
        PurchaseOrder: { purchaseOrderID: '1', purchaseOrderNumber: 'PO-001' },
      };

      (purchasesService as any).get = jest.fn().mockResolvedValue(mockResponse);

      const result = await purchasesService.getPurchaseOrder('1');
      expect(result).toEqual(mockResponse.PurchaseOrder);
      expect((purchasesService as any).get).toHaveBeenCalledWith(
        '/Account/test-account-id/PurchaseOrder/1.json'
      );
    });

    it('debe manejar PurchaseOrder como array', async () => {
      const mockResponse = {
        PurchaseOrder: [{ purchaseOrderID: '1' }],
      };

      (purchasesService as any).get = jest.fn().mockResolvedValue(mockResponse);

      const result = await purchasesService.getPurchaseOrder('1');
      expect(result).toEqual(mockResponse.PurchaseOrder[0]);
    });

    it('debe retornar null cuando la orden no existe', async () => {
      const error: any = new Error('Not found');
      error.response = { status: 404 };

      (purchasesService as any).get = jest.fn().mockRejectedValue(error);

      const result = await purchasesService.getPurchaseOrder('999');
      expect(result).toBeNull();
    });
  });

  describe('syncPurchaseOrders', () => {
    it('debe sincronizar órdenes de compra', async () => {
      const mockOrders = [{ purchaseOrderID: '1' }];
      jest.spyOn(purchasesService, 'getAllPurchaseOrders').mockResolvedValue(mockOrders);

      const result = await purchasesService.syncPurchaseOrders();
      expect(result).toEqual(mockOrders);
    });
  });
});
