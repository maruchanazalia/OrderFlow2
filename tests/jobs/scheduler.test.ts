import { SyncScheduler } from '../../src/jobs/scheduler';
import { LightspeedAuth } from '../../src/config/auth';
import { Database } from '../../src/db/models';
import { CatalogService } from '../../src/services/catalog';
import { InventoryService } from '../../src/services/inventory';
import { SalesService } from '../../src/services/sales';
import { PurchasesService } from '../../src/services/purchases';

jest.mock('../../src/config/auth');
jest.mock('../../src/db/models');
jest.mock('../../src/services/catalog');
jest.mock('../../src/services/inventory');
jest.mock('../../src/services/sales');
jest.mock('../../src/services/purchases');
jest.mock('../../src/config/contpaqiAuth');
jest.mock('../../src/services/contpaqiProducts');
jest.mock('../../src/services/contpaqiDocuments');
jest.mock('../../src/jobs/queueProcessor');

describe('SyncScheduler', () => {
  let scheduler: SyncScheduler;
  let mockAuth: jest.Mocked<LightspeedAuth>;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    mockAuth = {
      getAxiosInstance: jest.fn().mockReturnValue({} as any),
      getAccountId: jest.fn().mockReturnValue('test-account-id'),
    } as any;

    mockDb = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getLastSyncTime: jest.fn().mockResolvedValue(null),
      updateSyncTime: jest.fn().mockResolvedValue(undefined),
      getItemsWithoutMapping: jest.fn().mockResolvedValue([]),
      enqueueContpaqiOperation: jest.fn().mockResolvedValue(1),
      getItemsWithMappingAndInventory: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    (LightspeedAuth as jest.MockedClass<typeof LightspeedAuth>).mockImplementation(() => mockAuth);
    (Database as jest.MockedClass<typeof Database>).mockImplementation(() => mockDb);

    // Mock de servicios
    jest.spyOn(CatalogService.prototype, 'syncAllCatalogs').mockResolvedValue({
      categories: [],
      itemMatrices: [],
      items: [],
    });

    jest.spyOn(InventoryService.prototype, 'syncInventory').mockResolvedValue([]);
    jest.spyOn(SalesService.prototype, 'getSales').mockResolvedValue([]);
    jest.spyOn(SalesService.prototype, 'getReturns').mockResolvedValue([]);
    jest.spyOn(PurchasesService.prototype, 'syncPurchaseOrders').mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('debe inicializar correctamente', () => {
      expect(() => {
        scheduler = new SyncScheduler();
      }).not.toThrow();
    });
  });

  describe('runSync', () => {
    beforeEach(() => {
      scheduler = new SyncScheduler();
    });

    it('debe ejecutar sincronización completa', async () => {
      await scheduler.runSync();

      expect(mockDb.getLastSyncTime).toHaveBeenCalled();
    });

    it('debe manejar errores sin detener el proceso', async () => {
      jest.spyOn(SalesService.prototype, 'getSales').mockRejectedValue(new Error('Test error'));

      await expect(scheduler.runSync()).resolves.not.toThrow();
    });
  });

  describe('syncCatalogs', () => {
    beforeEach(() => {
      scheduler = new SyncScheduler();
    });

    it('debe sincronizar catálogos correctamente', async () => {
      mockDb.getLastSyncTime.mockResolvedValue(null);

      await (scheduler as any).syncCatalogs();

      expect(mockDb.getLastSyncTime).toHaveBeenCalledWith('catalogs');
    });
  });

  describe('syncSales', () => {
    beforeEach(() => {
      scheduler = new SyncScheduler();
    });

    it('debe sincronizar ventas correctamente', async () => {
      const mockSales = [
        { saleID: '1', total: '100' },
        { saleID: '2', total: '200' },
      ];

      jest.spyOn(SalesService.prototype, 'getSales').mockResolvedValue(mockSales as any);
      mockDb.upsertSale = jest.fn().mockResolvedValue(undefined);

      await (scheduler as any).syncSales();

      expect(mockDb.upsertSale).toHaveBeenCalledTimes(2);
    });

    it('debe manejar errores individuales en ventas', async () => {
      const mockSales = [
        { saleID: '1', total: '100' },
        { saleID: '2', total: '200' },
      ];

      jest.spyOn(SalesService.prototype, 'getSales').mockResolvedValue(mockSales as any);
      mockDb.upsertSale = jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('DB error'));

      await expect((scheduler as any).syncSales()).resolves.not.toThrow();
    });
  });

  describe('syncReturns', () => {
    beforeEach(() => {
      scheduler = new SyncScheduler();
    });

    it('debe sincronizar devoluciones correctamente', async () => {
      const mockReturns = [
        { saleID: '1', total: '-50' },
      ];

      jest.spyOn(SalesService.prototype, 'getReturns').mockResolvedValue(mockReturns as any);
      mockDb.upsertReturn = jest.fn().mockResolvedValue(undefined);

      await (scheduler as any).syncReturns();

      expect(mockDb.upsertReturn).toHaveBeenCalled();
    });
  });

  describe('processSaleToContpaqi', () => {
    beforeEach(() => {
      scheduler = new SyncScheduler();
    });

    it('debe crear documento con cliente 1, coordenadas 1, y almacen 1', async () => {
      const sale = {
        sale_id: 'S1',
        sale_number: '116',
        reference_number: '116',
        complete_time: '2021-02-10T20:38:41',
      };

      mockDb.query = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM sale_lines')) {
          return Promise.resolve({ rows: [
            { item_id: 'P1', unit_quantity: '1', unit_price: '344.82', sale_line_id: 'SL1' }
          ]});
        }

        if (sql.includes('FROM items')) {
          return Promise.resolve({ rows: [{ custom_sku: '0', system_sku: '0', upc: '0' }] });
        }

        return Promise.resolve({ rows: [] });
      });

      mockDb.enqueueContpaqiOperation = jest.fn().mockResolvedValue(1);

      const result = await (scheduler as any).processSaleToContpaqi(sale);

      expect(result).toBe('agregada');
      expect(mockDb.enqueueContpaqiOperation).toHaveBeenCalledWith(
        'process_document',
        expect.objectContaining({
          Concepto: 'LVEN',
          Cliente: '1',
          Coordenadas: '1',
          Observacion: 'Venta desde Lightspeed - 116',
          Referencia: '116',
          Agente: 'Sistema de Sincronización',
          Fecha: expect.any(String),
          Movimientos: [
            expect.objectContaining({
              Producto: '0',
              Cantidad: 1,
              Precio: 344.82,
              Almacen: '1',
            }),
          ],
        }),
        8
      );
    });
  });

  describe('syncPurchaseOrders', () => {
    beforeEach(() => {
      scheduler = new SyncScheduler();
    });

    it('debe sincronizar órdenes de compra correctamente', async () => {
      const mockOrders = [
        { purchaseOrderID: '1', purchaseOrderNumber: 'PO-001' },
      ];

      jest.spyOn(PurchasesService.prototype, 'syncPurchaseOrders').mockResolvedValue(mockOrders as any);
      mockDb.upsertPurchaseOrder = jest.fn().mockResolvedValue(undefined);

      await (scheduler as any).syncPurchaseOrders();

      expect(mockDb.upsertPurchaseOrder).toHaveBeenCalled();
    });

    it('debe manejar endpoint no disponible (404)', async () => {
      const error: any = new Error('Not found');
      error.response = { status: 404 };

      jest.spyOn(PurchasesService.prototype, 'syncPurchaseOrders').mockRejectedValue(error);

      await expect((scheduler as any).syncPurchaseOrders()).resolves.not.toThrow();
    });
  });

  describe('getLatestTimestamp', () => {
    beforeEach(() => {
      scheduler = new SyncScheduler();
    });

    it('debe retornar el timestamp más reciente', () => {
      const items = [
        { timeStamp: '2025-01-01T00:00:00Z' },
        { timeStamp: '2025-01-05T00:00:00Z' },
        { timeStamp: '2025-01-03T00:00:00Z' },
      ];

      const result = (scheduler as any).getLatestTimestamp(items);
      expect(result).toBe('2025-01-05T00:00:00.000Z');
    });

    it('debe retornar null cuando no hay timestamps', () => {
      const items = [{}, {}];
      const result = (scheduler as any).getLatestTimestamp(items);
      expect(result).toBeNull();
    });

    it('debe retornar null cuando el array está vacío', () => {
      const result = (scheduler as any).getLatestTimestamp([]);
      expect(result).toBeNull();
    });
  });
});
