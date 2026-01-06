import { ContpaqiDocumentsService } from '../../src/services/contpaqiDocuments';
import { AxiosInstance } from 'axios';

describe('ContpaqiDocumentsService', () => {
  let documentsService: ContpaqiDocumentsService;
  let mockAxios: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    mockAxios = {
      post: jest.fn(),
    } as any;

    documentsService = new ContpaqiDocumentsService(mockAxios);
  });

  describe('procesarDocumento', () => {
    it('debe procesar documento exitosamente', async () => {
      const documento = {
        Concepto: 'Test',
        Fecha: '2025-01-05',
        Movimientos: [
          { CodigoProducto: 'PROD-001', Cantidad: 10 },
        ],
      };

      const mockResponse = {
        data: {
          success: true,
          documentoId: 'DOC-123',
        },
      };

      mockAxios.post.mockResolvedValue(mockResponse as any);

      const result = await documentsService.procesarDocumento(documento);
      expect(result.success).toBe(true);
      expect(result.documentoId).toBe('DOC-123');
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/Documento/ProcesarDocumento',
        documento,
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('debe lanzar error cuando la respuesta indica error', async () => {
      const documento = {
        Concepto: 'Test',
        Fecha: '2025-01-05',
        Movimientos: [{ CodigoProducto: 'PROD-001', Cantidad: 10 }],
      };

      const mockResponse = {
        data: {
          success: false,
          error: 'Error de validación',
        },
      };

      mockAxios.post.mockResolvedValue(mockResponse as any);

      await expect(documentsService.procesarDocumento(documento)).rejects.toThrow('Error de validación');
    });

    it('debe manejar errores de red', async () => {
      const documento = {
        Concepto: 'Test',
        Fecha: '2025-01-05',
        Movimientos: [{ CodigoProducto: 'PROD-001', Cantidad: 10 }],
      };

      const error = new Error('Network error');
      mockAxios.post.mockRejectedValue(error);

      await expect(documentsService.procesarDocumento(documento)).rejects.toThrow('Network error');
    });
  });

  describe('crearAjusteInventario', () => {
    it('debe crear ajuste de inventario', async () => {
      const mockResponse = {
        data: { success: true, documentoId: 'DOC-123' },
      };

      jest.spyOn(documentsService, 'procesarDocumento').mockResolvedValue(mockResponse.data);

      const result = await documentsService.crearAjusteInventario('PROD-001', 10);
      expect(result.success).toBe(true);
      expect(documentsService.procesarDocumento).toHaveBeenCalledWith(
        expect.objectContaining({
          Concepto: 'Ajuste de inventario desde Lightspeed',
          Movimientos: [{ CodigoProducto: 'PROD-001', Cantidad: 10 }],
        })
      );
    });

    it('debe usar fecha personalizada cuando se proporciona', async () => {
      const mockResponse = {
        data: { success: true },
      };

      jest.spyOn(documentsService, 'procesarDocumento').mockResolvedValue(mockResponse.data);

      await documentsService.crearAjusteInventario('PROD-001', 10, 'Test concepto', '2025-01-01');
      
      expect(documentsService.procesarDocumento).toHaveBeenCalledWith(
        expect.objectContaining({
          Concepto: 'Test concepto',
          Fecha: '2025-01-01',
        })
      );
    });
  });

  describe('crearDocumentoConMovimientos', () => {
    it('debe crear documento con múltiples movimientos', async () => {
      const movimientos = [
        { CodigoProducto: 'PROD-001', Cantidad: 10 },
        { CodigoProducto: 'PROD-002', Cantidad: 20 },
      ];

      const mockResponse = {
        data: { success: true, documentoId: 'DOC-123' },
      };

      jest.spyOn(documentsService, 'procesarDocumento').mockResolvedValue(mockResponse.data);

      const result = await documentsService.crearDocumentoConMovimientos(
        movimientos,
        'Test concepto',
        'CLIENT-001',
        'AGENT-001',
        '2025-01-05'
      );

      expect(result.success).toBe(true);
      expect(documentsService.procesarDocumento).toHaveBeenCalledWith(
        expect.objectContaining({
          Concepto: 'Test concepto',
          Cliente: 'CLIENT-001',
          Agente: 'AGENT-001',
          Fecha: '2025-01-05',
          Movimientos: movimientos,
        })
      );
    });
  });

  describe('formatDate', () => {
    it('debe formatear fecha desde Date', () => {
      const date = new Date('2025-01-05T12:00:00Z');
      const result = documentsService.formatDate(date);
      expect(result).toBe('2025-01-05');
    });

    it('debe formatear fecha desde string', () => {
      const result = documentsService.formatDate('2025-01-05T12:00:00Z');
      expect(result).toBe('2025-01-05');
    });
  });
});
