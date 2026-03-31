import { ContpaqiDocumentsService } from '../../src/services/contpaqiDocuments';
import { AxiosInstance } from 'axios';

describe('ContpaqiDocumentsService', () => {
  let documentsService: ContpaqiDocumentsService;
  let mockAxios: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    mockAxios = {
      post: jest.fn(),
      defaults: {
        baseURL: 'https://api.contpaqi.com',
      },
    } as any;

    documentsService = new ContpaqiDocumentsService(mockAxios);
  });

  describe('procesarDocumento', () => {
    it('debe procesar documento exitosamente', async () => {
      const documento = {
        Concepto: 'Test',
        Fecha: '2025-01-05',
        Movimientos: [
          { Producto: 'PROD-001', Cantidad: 10, Precio: 100 },
        ],
      };

      const mockResponse = {
        data: 'OK',
      };

      mockAxios.post.mockResolvedValue(mockResponse as any);

      const result = await documentsService.procesarDocumento(documento);
      expect(result).toBe('OK');
      
      // Verificar que Cliente, Coordenadas y Almacen fueron normalizados a '1'
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/Documento/ProcesarDocumentoBike',
        expect.objectContaining({
          Cliente: '1',
          Coordenadas: '1',
          Movimientos: expect.arrayContaining([
            expect.objectContaining({
              Almacen: '1',
            }),
          ]),
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('debe lanzar error cuando la respuesta indica error', async () => {
      const documento = {
        Concepto: 'Test',
        Fecha: '2025-01-05',
        Movimientos: [{ Producto: 'PROD-001', Cantidad: 10, Precio: 100 }],
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
        Movimientos: [{ Producto: 'PROD-001', Cantidad: 10, Precio: 100 }],
      };

      const error = new Error('Network error');
      mockAxios.post.mockRejectedValue(error);

      await expect(documentsService.procesarDocumento(documento)).rejects.toThrow('Network error');
    });
  });

  describe('crearAjusteInventario', () => {
    it('debe crear ajuste de inventario', async () => {
      const mockResponse = 'OK';

      jest.spyOn(documentsService, 'procesarDocumento').mockResolvedValue(mockResponse);

      const result = await documentsService.crearAjusteInventario('PROD-001', 10, 50);
      expect(result).toBe(mockResponse);
      expect(documentsService.procesarDocumento).toHaveBeenCalledWith(
        expect.objectContaining({
          Concepto: '3',
          Cliente: '1',
          Coordenadas: '1',
          Movimientos: [
            expect.objectContaining({
              Producto: 'PROD-001',
              Cantidad: 10,
              Precio: 50,
              Almacen: '1',
            }),
          ],
        })
      );
    });

    it('debe usar fecha personalizada cuando se proporciona', async () => {
      const mockResponse = 'OK';

      jest.spyOn(documentsService, 'procesarDocumento').mockResolvedValue(mockResponse);

      await documentsService.crearAjusteInventario('PROD-001', 10, 50, 'Test concepto', '2025-01-01');
      
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
        { Producto: 'PROD-001', Cantidad: 10, Precio: 100 },
        { Producto: 'PROD-002', Cantidad: 20, Precio: 200 },
      ];

      const mockResponse = 'OK';

      jest.spyOn(documentsService, 'procesarDocumento').mockResolvedValue(mockResponse);

      const result = await documentsService.crearDocumentoConMovimientos(
        movimientos,
        'Test concepto',
        'CLIENT-001',
        'AGENT-001',
        '2025-01-05'
      );

      expect(result).toBe(mockResponse);
      expect(documentsService.procesarDocumento).toHaveBeenCalledWith(
        expect.objectContaining({
          Concepto: 'Test concepto',
          Cliente: 'CLIENT-001',
          Coordenadas: '1',
          Agente: 'AGENT-001',
          Fecha: '2025-01-05',
          Movimientos: [
            expect.objectContaining({
              Producto: 'PROD-001',
              Cantidad: 10,
              Precio: 100,
              Almacen: '1',
            }),
            expect.objectContaining({
              Producto: 'PROD-002',
              Cantidad: 20,
              Precio: 200,
              Almacen: '1',
            }),
          ],
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
