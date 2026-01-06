import { ContpaqiQueueProcessor } from '../../src/jobs/queueProcessor';
import { Database } from '../../src/db/models';
import { ContpaqiProductsService } from '../../src/services/contpaqiProducts';
import { ContpaqiDocumentsService } from '../../src/services/contpaqiDocuments';

jest.mock('../../src/db/models');
jest.mock('../../src/services/contpaqiProducts');
jest.mock('../../src/services/contpaqiDocuments');

describe('ContpaqiQueueProcessor', () => {
  let processor: ContpaqiQueueProcessor;
  let mockDb: jest.Mocked<Database>;
  let mockProductsService: jest.Mocked<ContpaqiProductsService>;
  let mockDocumentsService: jest.Mocked<ContpaqiDocumentsService>;

  beforeEach(() => {
    mockDb = {
      getPendingQueueOperations: jest.fn().mockResolvedValue([]),
      markQueueOperationCompleted: jest.fn().mockResolvedValue(undefined),
      markQueueOperationFailed: jest.fn().mockResolvedValue(undefined),
      updateSyncLogsWithDocumentId: jest.fn().mockResolvedValue(undefined),
      getQueueStats: jest.fn().mockResolvedValue({
        pending: 0,
        completed: 0,
        failed: 0,
        total: 0,
      }),
      upsertProductMapping: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockProductsService = {
      getProduct: jest.fn(),
      getProductExistencia: jest.fn(),
    } as any;

    mockDocumentsService = {
      procesarDocumento: jest.fn(),
    } as any;

    processor = new ContpaqiQueueProcessor(
      mockDb,
      mockProductsService,
      mockDocumentsService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (processor) {
      processor.stop();
    }
  });

  describe('processQueue', () => {
    it('debe procesar operaciones pendientes', async () => {
      const mockOperations = [
        {
          id: 1,
          operationType: 'map_product',
          payload: { itemId: '123', code: 'PROD-001' },
          retryCount: 0,
          maxRetries: 3,
        },
      ];

      mockDb.getPendingQueueOperations.mockResolvedValue(mockOperations);
      mockProductsService.getProduct.mockResolvedValue({
        CodigoProducto: 'PROD-001',
      } as any);

      await (processor as any).processQueue();

      expect(mockDb.getPendingQueueOperations).toHaveBeenCalled();
    });

    it('debe manejar operaciones vacías', async () => {
      mockDb.getPendingQueueOperations.mockResolvedValue([]);

      await (processor as any).processQueue();

      expect(mockDb.getPendingQueueOperations).toHaveBeenCalled();
    });
  });

  describe('processMapProduct', () => {
    it('debe mapear producto exitosamente', async () => {
      const operation = {
        id: 1,
        payload: { itemId: '123', code: 'PROD-001' },
      };

      mockProductsService.getProduct.mockResolvedValue({
        CodigoProducto: 'PROD-001',
      } as any);

      mockDb.upsertProductMapping = jest.fn().mockResolvedValue(undefined);

      await (processor as any).processMapProduct(operation);

      expect(mockProductsService.getProduct).toHaveBeenCalledWith('PROD-001');
      expect(mockDb.upsertProductMapping).toHaveBeenCalled();
      expect(mockDb.markQueueOperationCompleted).toHaveBeenCalled();
    });

    it('debe manejar producto no encontrado', async () => {
      const operation = {
        id: 1,
        payload: { itemId: '123', code: 'INVALID' },
      };

      mockProductsService.getProduct.mockResolvedValue(null);

      await expect((processor as any).processMapProduct(operation)).rejects.toThrow();
    });
  });

  describe('processDocument', () => {
    it('debe procesar documento exitosamente', async () => {
      const operation = {
        id: 1,
        payload: {
          Concepto: 'Test',
          Fecha: '2025-01-05',
          Movimientos: [
            { CodigoProducto: 'PROD-001', Cantidad: 10 },
          ],
        },
      };

      mockDocumentsService.procesarDocumento.mockResolvedValue({
        success: true,
        documentoId: 'DOC-123',
      } as any);

      await (processor as any).processDocument(operation);

      expect(mockDocumentsService.procesarDocumento).toHaveBeenCalled();
      expect(mockDb.markQueueOperationCompleted).toHaveBeenCalled();
    });

    it('debe manejar documento sin movimientos', async () => {
      const operation = {
        id: 1,
        payload: {
          Concepto: 'Test',
          Movimientos: [],
        },
      };

      await expect((processor as any).processDocument(operation)).rejects.toThrow('Documento sin movimientos');
    });

    it('debe manejar error al procesar documento', async () => {
      const operation = {
        id: 1,
        payload: {
          Concepto: 'Test',
          Fecha: '2025-01-05',
          Movimientos: [{ CodigoProducto: 'PROD-001', Cantidad: 10 }],
        },
      };

      mockDocumentsService.procesarDocumento.mockRejectedValue(new Error('API error'));

      await expect((processor as any).processDocument(operation)).rejects.toThrow('API error');
    });
  });

  describe('start y stop', () => {
    it('debe iniciar y detener correctamente', () => {
      processor.start();
      // Verificar que el intervalo se configuró (puede ser un número o un objeto)
      const interval = (processor as any).processingInterval;
      expect(interval).toBeDefined();

      processor.stop();
      // Después de stop, el intervalo debería ser null o undefined
      const stoppedInterval = (processor as any).processingInterval;
      expect(stoppedInterval).toBeFalsy();
    });
  });
});
