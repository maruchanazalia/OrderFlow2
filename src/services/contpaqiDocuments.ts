import { AxiosInstance } from 'axios';
import { logger } from '../config/logger';

export interface ContpaqiMovimiento {
  Producto: string; // ID del producto en CONTPAQi
  Cantidad: number;
  Precio: number; // Requerido
  Almacen?: string; // Almacén asignado (por defecto '1')
  [key: string]: any;
}

export interface ContpaqiDocumento {
  Concepto: string; // ID del concepto en CONTPAQi
  Cliente?: string; // ID del cliente en CONTPAQi
  Coordenadas?: string; // Campo adicional requerido por el formato
  Fecha: string; // Formato ISO completo: "2023-06-27T12:34:56"
  Observacion?: string; // Con una 'c'
  Referencia?: string;
  Agente?: string;
  Movimientos: ContpaqiMovimiento[];
  [key: string]: any;
}

// El retorno puede ser string o un objeto de respuesta de CONTPAQi
export type ContpaqiDocumentoResponse = any;

export class ContpaqiDocumentsService {
  private axiosInstance: AxiosInstance;

  constructor(axiosInstance: AxiosInstance) {
    this.axiosInstance = axiosInstance;
  }

  /**
   * Procesa un documento en CONTPAQi (entrada/salida de inventario)
   */
  async procesarDocumento(documento: ContpaqiDocumento): Promise<string> {
    try {
      const documentoNormalizado: ContpaqiDocumento = {
        ...documento,
        Cliente: documento.Cliente || '1',
        Coordenadas: documento.Coordenadas || '1',
        Movimientos: documento.Movimientos.map((mov) => ({
          ...mov,
          Almacen: mov.Almacen || '1',
        })),
      };

      // Eliminar campos undefined para evitar serializarlos como null
      const documentoLimpio = JSON.parse(JSON.stringify(documentoNormalizado));

      const baseUrl = this.axiosInstance.defaults.baseURL || '';
      const url = `${baseUrl}/api/Documento/ProcesarDocumentoBike`;
      
      logger.info(`Procesando documento CONTPAQi: ${documentoLimpio.Concepto} con ${documentoLimpio.Movimientos.length} movimientos`);

      const response = await this.axiosInstance.post<string>(
        `/api/Documento/ProcesarDocumentoBike`,
        documentoLimpio,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`Documento procesado exitosamente: ${JSON.stringify(response.data)}`);
      const responseData: any = response.data;

      if (responseData && typeof responseData === 'object' && responseData.success === false) {
        throw new Error(responseData.error || 'Error de validación de documento');
      }

      return responseData;
    } catch (error: any) {
      logger.error('Error al procesar documento en CONTPAQi', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        documento: documento.Concepto,
      });
      throw error;
    }
  }

  /**
   * Crea un documento de ajuste de inventario
   */
  async crearAjusteInventario(
    productoId: string,
    cantidad: number,
    precio: number,
    conceptoId: string = '3',
    fecha?: string
  ): Promise<string> {
    const documento: ContpaqiDocumento = {
      Concepto: conceptoId,
      Cliente: '1',
      Coordenadas: '1',
      Fecha: fecha || new Date().toISOString().replace('Z', ''),
      Movimientos: [
        {
          Producto: productoId,
          Cantidad: cantidad,
          Precio: precio,
          Almacen: '1',
        },
      ],
    };

    return await this.procesarDocumento(documento);
  }

  /**
   * Crea un documento con múltiples movimientos
   */
  async crearDocumentoConMovimientos(
    movimientos: ContpaqiMovimiento[],
    conceptoId: string = '3',
    clienteId?: string,
    agente?: string,
    fecha?: string,
    observacion?: string,
    referencia?: string
  ): Promise<string> {
    const documento: ContpaqiDocumento = {
      Concepto: conceptoId,
      Cliente: clienteId || '1',
      Coordenadas: '1',
      Fecha: fecha || new Date().toISOString().replace('Z', ''),
      Observacion: observacion,
      Referencia: referencia,
      Agente: agente,
      Movimientos: movimientos.map((mov) => ({
        ...mov,
        Almacen: mov.Almacen || '1',
      })),
    };

    return await this.procesarDocumento(documento);
  }

  /**
   * Formatea una fecha para CONTPAQi
   */
  formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }
}

