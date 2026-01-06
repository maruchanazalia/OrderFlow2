import { Database } from '../../src/db/models';
import { Pool } from 'pg';
import { Sale, SaleLine } from '../../src/services/sales';
import { PurchaseOrder } from '../../src/services/purchases';

jest.mock('pg', () => {
  const mockPool = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  };
  return {
    Pool: jest.fn(() => mockPool),
  };
});

describe('Database', () => {
  let db: Database;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn().mockResolvedValue({ rows: [] }),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    const MockedPool = Pool as jest.MockedClass<typeof Pool>;
    MockedPool.mockImplementation(() => mockPool as any);
    db = new Database();
  });

  describe('initialize', () => {
    it('debe crear todas las tablas', async () => {
      await db.initialize();
      expect(mockClient.query).toHaveBeenCalled();
    });
  });

  describe('upsertSale', () => {
    it('debe insertar venta correctamente', async () => {
      const sale: Sale = {
        saleID: '123',
        saleNumber: 'SALE-001',
        total: '100.00',
        SaleLine: [
          {
            saleLineID: '1',
            itemID: 'item-1',
            unitQuantity: '5',
            unitPrice: '20.00',
          },
        ],
      };

      await db.upsertSale(sale);

      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sales'),
        expect.any(Array)
      );
    });

    it('debe manejar SaleLine como array', async () => {
      const sale: Sale = {
        saleID: '123',
        SaleLine: [
          { saleLineID: '1', itemID: 'item-1', unitQuantity: '5' },
          { saleLineID: '2', itemID: 'item-2', unitQuantity: '3' },
        ],
      };

      await db.upsertSale(sale);
      expect(mockClient.query).toHaveBeenCalled();
    });

    it('debe manejar SaleLine como objeto único', async () => {
      const sale: Sale = {
        saleID: '123',
        SaleLine: { saleLineID: '1', itemID: 'item-1', unitQuantity: '5' },
      };

      await db.upsertSale(sale);
      expect(mockClient.query).toHaveBeenCalled();
    });
  });

  describe('upsertPurchaseOrder', () => {
    it('debe insertar orden de compra correctamente', async () => {
      const po: PurchaseOrder = {
        purchaseOrderID: '123',
        purchaseOrderNumber: 'PO-001',
        vendorID: 'vendor-1',
        total: '500.00',
        PurchaseOrderLine: [
          {
            purchaseOrderLineID: '1',
            itemID: 'item-1',
            quantity: '10',
            cost: '50.00',
          },
        ],
      };

      await db.upsertPurchaseOrder(po);

      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO purchase_orders'),
        expect.any(Array)
      );
    });
  });

  describe('upsertReturn', () => {
    it('debe insertar devolución correctamente', async () => {
      const sale: Sale = {
        saleID: '123',
        saleNumber: 'RETURN-001',
        total: '-50.00',
        SaleLine: [
          {
            saleLineID: '1',
            itemID: 'item-1',
            unitQuantity: '-2',
            returned: 'true',
          },
        ],
      };

      await db.upsertReturn(sale);

      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO returns'),
        expect.any(Array)
      );
    });
  });

  describe('getLastSyncTime', () => {
    it('debe retornar null cuando no hay sincronización previa', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await db.getLastSyncTime('test');
      expect(result).toBeNull();
    });

    it('debe retornar timestamp cuando existe sincronización', async () => {
      const timestamp = new Date('2025-01-05T19:49:43.000Z');
      mockPool.query.mockResolvedValue({
        rows: [{ last_updated_since: timestamp }],
      });

      const result = await db.getLastSyncTime('test');
      expect(result).toBe(timestamp.toISOString());
    });
  });

  describe('updateSyncTime', () => {
    it('debe actualizar timestamp de sincronización', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await db.updateSyncTime('test', '2025-01-05T19:49:43.000Z');
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('getProductMapping', () => {
    it('debe retornar mapeo cuando existe', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ contpaqi_codigo: 'PROD-001' }],
      });

      const result = await db.getProductMapping('item-123');
      expect(result).toEqual({ contpaqiCodigo: 'PROD-001' });
    });

    it('debe retornar null cuando no existe mapeo', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await db.getProductMapping('item-123');
      expect(result).toBeNull();
    });
  });

  describe('upsertProductMapping', () => {
    it('debe crear mapeo de producto', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await db.upsertProductMapping('item-123', 'PROD-001', 'auto', 'Test mapping');
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('enqueueContpaqiOperation', () => {
    it('debe agregar operación a la cola', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }],
      });

      const id = await db.enqueueContpaqiOperation('map_product', { itemId: '123' }, 5);
      expect(id).toBe(1);
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('debe soportar diferentes tipos de operación', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 1 }] });

      await db.enqueueContpaqiOperation('process_purchase', { test: 'data' }, 8);
      await db.enqueueContpaqiOperation('process_return', { test: 'data' }, 8);
      await db.enqueueContpaqiOperation('process_document', { test: 'data' }, 8);

      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('getPendingQueueOperations', () => {
    it('debe retornar operaciones pendientes', async () => {
      const mockOperations = [
        {
          id: 1,
          operation_type: 'map_product',
          payload: '{"itemId":"123"}',
          retry_count: 0,
          max_retries: 3,
        },
      ];

      mockPool.query.mockResolvedValue({
        rows: mockOperations,
      });

      const result = await db.getPendingQueueOperations(10);
      expect(result).toHaveLength(1);
      expect(result[0].operationType).toBe('map_product');
      expect(result[0].payload).toEqual({ itemId: '123' });
    });
  });

  describe('markQueueOperationCompleted', () => {
    it('debe marcar operación como completada', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await db.markQueueOperationCompleted(1, { success: true });
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('markQueueOperationFailed', () => {
    it('debe marcar operación como fallida y programar reintento', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await db.markQueueOperationFailed(1, 'Error test', 0, 3);
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('getItemsWithoutMapping', () => {
    it('debe retornar items sin mapeo', async () => {
      const mockItems = [
        {
          item_id: '1',
          system_sku: 'SKU-001',
          custom_sku: null,
          upc: null,
          ean: null,
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockItems });

      const result = await db.getItemsWithoutMapping(100);
      expect(result).toHaveLength(1);
      expect(result[0].item_id).toBe('1');
    });
  });

  describe('getItemsWithMappingAndInventory', () => {
    it('debe retornar items con mapeo e inventario', async () => {
      const mockItems = [
        {
          item_id: '1',
          system_sku: 'SKU-001',
          contpaqi_codigo: 'PROD-001',
          qoh: 50,
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockItems });

      const result = await db.getItemsWithMappingAndInventory();
      expect(result).toHaveLength(1);
      expect(result[0].itemId).toBe('1');
      expect(result[0].contpaqiCodigo).toBe('PROD-001');
      expect(result[0].qoh).toBe(50);
    });
  });
});
