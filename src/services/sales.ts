import { AxiosInstance } from 'axios';
import { BaseService } from './base';
import { logger } from '../config/logger';

export interface SaleLine {
  saleLineID?: string;
  unitQuantity?: string;
  unitPrice?: string;
  normalUnitPrice?: string;
  discountAmount?: string;
  itemID?: string;
  timeStamp?: string;
  [key: string]: any;
}

export interface Sale {
  saleID?: string;
  saleNumber?: string;
  createTime?: string;
  timeStamp?: string;
  updateTime?: string;
  completeTime?: string;
  referenceNumber?: string;
  referenceNumberSource?: string;
  taxCategoryID?: string;
  employeeID?: string;
  registerID?: string;
  shopID?: string;
  customerID?: string;
  discountPercent?: string;
  discountAmount?: string;
  subtotal?: string;
  total?: string;
  totalDue?: string;
  totalTax?: string;
  archived?: string;
  voided?: string;
  SaleLine?: SaleLine | SaleLine[];
  SaleLines?: {
    SaleLine?: SaleLine | SaleLine[];
  };
  [key: string]: any;
}

export class SalesService extends BaseService {
  constructor(axiosInstance: AxiosInstance, accountId: string) {
    super(axiosInstance, accountId);
  }

  /**
   * Obtiene todas las ventas
   */
  async getAllSales(updatedSince?: string): Promise<Sale[]> {
    logger.info('Obteniendo ventas...');
    const params: Record<string, any> = {};
    
    if (updatedSince) {
      params.timeStamp = `>,${updatedSince}`;
    }

    const sales = await this.getAllPaginated<Sale>(
      `/Account/${this.accountId}/Sale.json`,
      params
    );

    logger.info(`Obtenidas ${sales.length} ventas`);
    return sales;
  }

  /**
   * Obtiene una venta específica por ID
   */
  async getSale(saleId: string): Promise<Sale | null> {
    try {
      logger.info(`Obteniendo venta ${saleId} desde Lightspeed API...`);
      const response = await this.get<{ Sale?: Sale }>(
        `/Account/${this.accountId}/Sale/${saleId}.json`
      );

      logger.info(`Respuesta de API para venta ${saleId}`, {
        tieneSaleData: !!response?.Sale,
        tieneSaleLine: !!response?.Sale?.SaleLine,
        tieneSaleLines: !!response?.Sale?.SaleLines,
        tieneSaleLinesSaleLine: !!response?.Sale?.SaleLines?.SaleLine,
        tipoSaleLine: response?.Sale?.SaleLine ? typeof response.Sale.SaleLine : 'N/A',
        esArraySaleLine: Array.isArray(response?.Sale?.SaleLine),
        keys: response?.Sale ? Object.keys(response.Sale) : [],
        rawResponse: JSON.stringify(response).substring(0, 1000)
      });

      if (response.Sale) {
        const sale = Array.isArray(response.Sale) ? response.Sale[0] : response.Sale;
        
        // Si la venta no tiene líneas, intentar obtenerlas desde el endpoint específico
        if (!sale.SaleLine && !sale.SaleLines?.SaleLine) {
          logger.info(`Venta ${saleId} sin líneas en respuesta principal, obteniendo desde endpoint SaleLine...`);
          const saleLines = await this.getSaleLines(saleId);
          if (saleLines.length > 0) {
            sale.SaleLines = { SaleLine: saleLines };
            logger.info(`Venta ${saleId}: agregadas ${saleLines.length} líneas desde endpoint SaleLine`);
          }
        }
        
        return sale;
      }

      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.warn(`Venta no encontrada: ${saleId}`);
        return null;
      }
      logger.error(`Error al obtener venta ${saleId} desde Lightspeed API`, {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Obtiene las líneas de una venta específica
   */
  async getSaleLines(saleId: string): Promise<SaleLine[]> {
    try {
      logger.info(`Obteniendo líneas de venta ${saleId} desde Lightspeed API...`);
      const response = await this.get<{ SaleLine?: SaleLine | SaleLine[] }>(
        `/Account/${this.accountId}/Sale/${saleId}/SaleLine.json`
      );

      logger.info(`Respuesta de API para líneas de venta ${saleId}`, {
        tieneSaleLine: !!response?.SaleLine,
        tipoSaleLine: response?.SaleLine ? typeof response.SaleLine : 'N/A',
        esArray: Array.isArray(response?.SaleLine),
        cantidad: response?.SaleLine ? (Array.isArray(response.SaleLine) ? response.SaleLine.length : 1) : 0,
        rawResponse: JSON.stringify(response).substring(0, 500)
      });

      if (response.SaleLine) {
        return Array.isArray(response.SaleLine) ? response.SaleLine : [response.SaleLine];
      }

      return [];
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.warn(`Líneas de venta no encontradas: ${saleId}`);
        return [];
      }
      logger.error(`Error al obtener líneas de venta ${saleId} desde Lightspeed API`, {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      // No lanzar error, solo retornar array vacío
      return [];
    }
  }

  /**
   * Sincroniza todas las ventas
   */
  async syncSales(updatedSince?: string): Promise<Sale[]> {
    logger.info('Iniciando sincronización de ventas...');
    return await this.getAllSales(updatedSince);
  }

  /**
   * Detecta si una venta es una devolución
   */
  isReturn(sale: Sale): boolean {
    if (sale.voided === 'true' || sale.voided === '1') {
      return false;
    }

    const saleLines = Array.isArray(sale.SaleLine) ? sale.SaleLine : sale.SaleLine ? [sale.SaleLine] : [];
    
    for (const line of saleLines) {
      if (line.returned === 'true' || line.returned === '1') {
        return true;
      }
      const quantity = parseFloat(line.unitQuantity || '0');
      if (quantity < 0) {
        return true;
      }
    }

    const total = parseFloat(sale.total || '0');
    if (total < 0) {
      return true;
    }

    return false;
  }

  /**
   * Obtiene solo las ventas normales (no devoluciones)
   */
  async getSales(updatedSince?: string): Promise<Sale[]> {
    const allSales = await this.getAllSales(updatedSince);
    return allSales.filter(sale => !this.isReturn(sale));
  }

  /**
   * Obtiene solo las devoluciones
   */
  async getReturns(updatedSince?: string): Promise<Sale[]> {
    const allSales = await this.getAllSales(updatedSince);
    return allSales.filter(sale => this.isReturn(sale));
  }
}

