import { AxiosInstance } from 'axios';
import { BaseService } from './base';
import { logger } from '../config/logger';

export interface Inventory {
  itemID?: string;
  qoh?: string; // Quantity on Hand
  qoo?: string; // Quantity on Order
  qbo?: string; // Quantity Backordered
  qs?: string;  // Quantity Sold
  qsbo?: string; // Quantity Sold Backordered
  timeStamp?: string;
  [key: string]: any;
}

export class InventoryService extends BaseService {
  constructor(axiosInstance: AxiosInstance, accountId: string) {
    super(axiosInstance, accountId);
  }

  /**
   * Obtiene todo el inventario
   */
  async getAllInventory(updatedSince?: string): Promise<Inventory[]> {
    logger.info('Obteniendo inventario...');
    const params: Record<string, any> = {};
    
    if (updatedSince) {
      params.timeStamp = `>,${updatedSince}`;
    }

    const inventory = await this.getAllPaginated<Inventory>(
      `/Account/${this.accountId}/Inventory.json`,
      params
    );

    logger.info(`Obtenido inventario para ${inventory.length} items`);
    return inventory;
  }

  /**
   * Obtiene el inventario de un item específico
   */
  async getItemInventory(itemId: string): Promise<Inventory | null> {
    try {
      const response = await this.get<{ Inventory?: Inventory }>(
        `/Account/${this.accountId}/Item/${itemId}/Inventory.json`
      );

      // La respuesta puede tener Inventory como objeto único o array
      if (response.Inventory) {
        return Array.isArray(response.Inventory) ? response.Inventory[0] : response.Inventory;
      }

      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.warn(`Inventario no encontrado para item ${itemId}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Sincroniza todo el inventario
   */
  async syncInventory(updatedSince?: string): Promise<Inventory[]> {
    logger.info('Iniciando sincronización de inventario...');
    return await this.getAllInventory(updatedSince);
  }
}

