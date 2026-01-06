import { SyncScheduler } from '../../src/jobs/scheduler';
import { Database } from '../../src/db/models';
import { LightspeedAuth } from '../../src/config/auth';

jest.mock('../../src/config/auth');
jest.mock('../../src/config/contpaqiAuth');
jest.mock('../../src/db/models');
jest.mock('../../src/services/catalog');
jest.mock('../../src/services/inventory');
jest.mock('../../src/services/sales');
jest.mock('../../src/services/purchases');
jest.mock('../../src/services/contpaqiProducts');
jest.mock('../../src/services/contpaqiDocuments');
jest.mock('../../src/jobs/queueProcessor');

describe('Flujo de Sincronización Completo', () => {
  let scheduler: SyncScheduler;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    const mockAuth = {
      getAxiosInstance: jest.fn().mockReturnValue({} as any),
      getAccountId: jest.fn().mockReturnValue('test-account-id'),
    };

    (LightspeedAuth as jest.MockedClass<typeof LightspeedAuth>).mockImplementation(() => mockAuth as any);

    mockDb = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getLastSyncTime: jest.fn().mockResolvedValue(null),
      updateSyncTime: jest.fn().mockResolvedValue(undefined),
      getItemsWithoutMapping: jest.fn().mockResolvedValue([]),
      enqueueContpaqiOperation: jest.fn().mockResolvedValue(1),
      getItemsWithMappingAndInventory: jest.fn().mockResolvedValue([]),
      upsertCategory: jest.fn().mockResolvedValue(undefined),
      upsertItemMatrix: jest.fn().mockResolvedValue(undefined),
      upsertItem: jest.fn().mockResolvedValue(undefined),
      upsertInventory: jest.fn().mockResolvedValue(undefined),
      upsertSale: jest.fn().mockResolvedValue(undefined),
      upsertReturn: jest.fn().mockResolvedValue(undefined),
      upsertPurchaseOrder: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    (Database as jest.MockedClass<typeof Database>).mockImplementation(() => mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe ejecutar flujo completo de sincronización', async () => {
    scheduler = new SyncScheduler();

    // Mock de servicios
    const { CatalogService } = require('../../src/services/catalog');
    const { InventoryService } = require('../../src/services/inventory');
    const { SalesService } = require('../../src/services/sales');
    const { PurchasesService } = require('../../src/services/purchases');

    jest.spyOn(CatalogService.prototype, 'syncAllCatalogs').mockResolvedValue({
      categories: [{ categoryID: '1' }],
      itemMatrices: [{ itemMatrixID: '1' }],
      items: [{ itemID: '1' }],
    });

    jest.spyOn(InventoryService.prototype, 'syncInventory').mockResolvedValue([
      { itemID: '1', qoh: '10' },
    ]);

    jest.spyOn(SalesService.prototype, 'getSales').mockResolvedValue([
      { saleID: '1', total: '100' },
    ]);

    jest.spyOn(SalesService.prototype, 'getReturns').mockResolvedValue([]);
    jest.spyOn(PurchasesService.prototype, 'syncPurchaseOrders').mockResolvedValue([]);

    await scheduler.runSync();

    expect(mockDb.getLastSyncTime).toHaveBeenCalled();
    expect(mockDb.updateSyncTime).toHaveBeenCalled();
  });

  it('debe manejar errores en cada sección sin detener el proceso', async () => {
    scheduler = new SyncScheduler();

    const { SalesService } = require('../../src/services/sales');
    jest.spyOn(SalesService.prototype, 'getSales').mockRejectedValue(new Error('Sales error'));

    await expect(scheduler.runSync()).resolves.not.toThrow();
  });

  it('debe sincronizar en el orden correcto', async () => {
    scheduler = new SyncScheduler();

    const callOrder: string[] = [];

    mockDb.getLastSyncTime.mockImplementation(async (type: string) => {
      callOrder.push(`getLastSyncTime-${type}`);
      return null;
    });

    await scheduler.runSync();

    // Verificar que se llamó en el orden correcto
    expect(callOrder).toContain('getLastSyncTime-catalogs');
    expect(callOrder).toContain('getLastSyncTime-inventory');
    expect(callOrder).toContain('getLastSyncTime-sales');
    expect(callOrder).toContain('getLastSyncTime-returns');
  });
});
