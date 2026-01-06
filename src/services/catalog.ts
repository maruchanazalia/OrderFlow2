import { AxiosInstance } from 'axios';
import { BaseService } from './base';
import { logger } from '../config/logger';

export interface Category {
  categoryID?: string;
  name?: string;
  nodeDepth?: string;
  fullPathName?: string;
  leftNode?: string;
  rightNode?: string;
  createTime?: string;
  timeStamp?: string;
  [key: string]: any;
}

export interface ItemMatrix {
  itemMatrixID?: string;
  description?: string;
  tax?: string;
  defaultCost?: string;
  itemType?: string;
  timeStamp?: string;
  [key: string]: any;
}

export interface Item {
  itemID?: string;
  systemSku?: string;
  defaultCost?: string;
  avgCost?: string;
  discountable?: string;
  tax?: string;
  archived?: string;
  itemType?: string;
  serialized?: string;
  description?: string;
  modelYear?: string;
  upc?: string;
  ean?: string;
  customSku?: string;
  manufacturerSku?: string;
  createTime?: string;
  timeStamp?: string;
  categoryID?: string;
  itemMatrixID?: string;
  [key: string]: any;
}

export class CatalogService extends BaseService {
  constructor(axiosInstance: AxiosInstance, accountId: string) {
    super(axiosInstance, accountId);
  }

  /**
   * Obtiene todas las categorías
   */
  async getAllCategories(updatedSince?: string): Promise<Category[]> {
    logger.info('Obteniendo categorías...');
    const params: Record<string, any> = {};
    
    if (updatedSince) {
      params.timeStamp = `>,${updatedSince}`;
    }

    const categories = await this.getAllPaginated<Category>(
      `/Account/${this.accountId}/Category.json`,
      params
    );

    logger.info(`Obtenidas ${categories.length} categorías`);
    return categories;
  }

  /**
   * Obtiene todas las matrices de items
   */
  async getAllItemMatrices(updatedSince?: string): Promise<ItemMatrix[]> {
    logger.info('Obteniendo matrices de items...');
    const params: Record<string, any> = {};
    
    if (updatedSince) {
      params.timeStamp = `>,${updatedSince}`;
    }

    const matrices = await this.getAllPaginated<ItemMatrix>(
      `/Account/${this.accountId}/ItemMatrix.json`,
      params
    );

    logger.info(`Obtenidas ${matrices.length} matrices de items`);
    return matrices;
  }

  /**
   * Obtiene todos los items
   */
  async getAllItems(updatedSince?: string): Promise<Item[]> {
    logger.info('Obteniendo items...');
    const params: Record<string, any> = {};
    
    if (updatedSince) {
      params.timeStamp = `>,${updatedSince}`;
    }

    const items = await this.getAllPaginated<Item>(
      `/Account/${this.accountId}/Item.json`,
      params
    );

    logger.info(`Obtenidos ${items.length} items`);
    return items;
  }

  /**
   * Sincroniza todos los catálogos (bootstrap inicial)
   */
  async syncAllCatalogs(): Promise<{
    categories: Category[];
    itemMatrices: ItemMatrix[];
    items: Item[];
  }> {
    logger.info('Iniciando sincronización completa de catálogos...');

    const [categories, itemMatrices, items] = await Promise.all([
      this.getAllCategories(),
      this.getAllItemMatrices(),
      this.getAllItems(),
    ]);

    logger.info(
      `Sincronización completa: ${categories.length} categorías, ${itemMatrices.length} matrices, ${items.length} items`
    );

    return {
      categories,
      itemMatrices,
      items,
    };
  }

  /**
   * Sincroniza catálogos actualizados desde una fecha
   */
  async syncUpdatedCatalogs(updatedSince: string): Promise<{
    categories: Category[];
    itemMatrices: ItemMatrix[];
    items: Item[];
  }> {
    logger.info(`Sincronizando catálogos actualizados desde ${updatedSince}...`);

    const [categories, itemMatrices, items] = await Promise.all([
      this.getAllCategories(updatedSince),
      this.getAllItemMatrices(updatedSince),
      this.getAllItems(updatedSince),
    ]);

    logger.info(
      `Sincronización incremental: ${categories.length} categorías, ${itemMatrices.length} matrices, ${items.length} items actualizados`
    );

    return {
      categories,
      itemMatrices,
      items,
    };
  }
}

