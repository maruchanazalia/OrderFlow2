import { AxiosInstance } from 'axios';
import { BaseService } from './base';
import { logger } from '../config/logger';

export interface PurchaseOrderLine {
  purchaseOrderLineID?: string;
  itemID?: string;
  quantity?: string;
  quantityReceived?: string;
  cost?: string;
  timeStamp?: string;
  [key: string]: any;
}

export interface PurchaseOrder {
  purchaseOrderID?: string;
  purchaseOrderNumber?: string;
  vendorID?: string;
  createTime?: string;
  timeStamp?: string;
  updateTime?: string;
  completeTime?: string;
  referenceNumber?: string;
  employeeID?: string;
  shopID?: string;
  taxCategoryID?: string;
  discountPercent?: string;
  discountAmount?: string;
  subtotal?: string;
  total?: string;
  totalTax?: string;
  archived?: string;
  voided?: string;
  PurchaseOrderLine?: PurchaseOrderLine | PurchaseOrderLine[];
  [key: string]: any;
}

export class PurchasesService extends BaseService {
  constructor(axiosInstance: AxiosInstance, accountId: string) {
    super(axiosInstance, accountId);
  }

  async getAllPurchaseOrders(updatedSince?: string): Promise<PurchaseOrder[]> {
    logger.info('Obteniendo órdenes de compra...');
    const params: Record<string, any> = {};
    
    if (updatedSince) {
      params.timeStamp = `>,${updatedSince}`;
    }

    try {
      const purchaseOrders = await this.getAllPaginated<PurchaseOrder>(
        `/Account/${this.accountId}/PurchaseOrder.json`,
        params
      );

      logger.info(`Obtenidas ${purchaseOrders.length} órdenes de compra`);
      return purchaseOrders;
    } catch (error: any) {
      // Si el endpoint no existe (404), retornar array vacío
      if (error.response?.status === 404 || error.status === 404) {
        logger.warn('Endpoint PurchaseOrder no disponible. Retornando array vacío.');
        return [];
      }
      throw error;
    }
  }

  async getPurchaseOrder(purchaseOrderId: string): Promise<PurchaseOrder | null> {
    try {
      const response = await this.get<{ PurchaseOrder?: PurchaseOrder }>(
        `/Account/${this.accountId}/PurchaseOrder/${purchaseOrderId}.json`
      );

      if (response.PurchaseOrder) {
        return Array.isArray(response.PurchaseOrder) ? response.PurchaseOrder[0] : response.PurchaseOrder;
      }

      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.warn(`Orden de compra no encontrada: ${purchaseOrderId}`);
        return null;
      }
      throw error;
    }
  }

  async syncPurchaseOrders(updatedSince?: string): Promise<PurchaseOrder[]> {
    logger.info('Iniciando sincronización de órdenes de compra...');
    return await this.getAllPurchaseOrders(updatedSince);
  }
}

