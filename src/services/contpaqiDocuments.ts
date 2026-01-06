import { AxiosInstance } from 'axios';
import { logger } from '../config/logger';

export interface ContpaqiMovimiento {
  Producto: string; // ID del producto en CONTPAQi
  Cantidad: number;
  Precio: number; // Requerido
  [key: string]: any;
}

export interface ContpaqiDocumento {
  Concepto: string; // ID del concepto en CONTPAQi
  Cliente?: string; // ID del cliente en CONTPAQi
  Fecha: string; // Formato ISO completo: "2023-06-27T12:34:56"
  Observacion?: string; // Con una 'c'
  Referencia?: string;
  Agente?: string;
  Movimientos: ContpaqiMovimiento[];
  [key: string]: any;
}

// El retorno es un String (mensaje de confirmación)
export type ContpaqiDocumentoResponse = string;

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
      const baseUrl = this.axiosInstance.defaults.baseURL || '';
      const url = `${baseUrl}/api/Documento/ProcesarDocumento`;
      
      logger.info(`Procesando documento CONTPAQi: ${documento.Concepto} con ${documento.Movimientos.length} movimientos`);

      const response = await this.axiosInstance.post<string>(
        `/api/Documento/ProcesarDocumento`,
        documento,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`Documento procesado exitosamente: ${response.data}`);
      
      return response.data;
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
      Fecha: fecha || new Date().toISOString().replace('Z', ''),
      Movimientos: [
        {
          Producto: productoId,
          Cantidad: cantidad,
          Precio: precio,
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
      Cliente: clienteId,
      Fecha: fecha || new Date().toISOString().replace('Z', ''),
      Observacion: observacion,
      Referencia: referencia,
      Agente: agente,
      Movimientos: movimientos,
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

