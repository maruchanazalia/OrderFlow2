import { AxiosInstance } from 'axios';
import { logger } from '../config/logger';

export interface ContpaqiProduct {
  CodigoProducto?: string;
  Nombre?: string;
  Existencia?: number;
  Precio?: number;
  Unidad?: string;
  [key: string]: any;
}

export interface ContpaqiExistencia {
  CodigoProducto?: string;
  Existencia?: number;
  Almacen?: string;
  [key: string]: any;
}

export class ContpaqiProductsService {
  private axiosInstance: AxiosInstance;

  constructor(axiosInstance: AxiosInstance) {
    this.axiosInstance = axiosInstance;
  }

  /**
   * Obtiene la existencia de un producto por código
   */
  async getProductExistencia(codigoProducto: string): Promise<ContpaqiExistencia | null> {
    try {
      const baseUrl = this.axiosInstance.defaults.baseURL || '';
      const url = `${baseUrl}/api/Productos/existencia?codigoProducto=${codigoProducto}`;
      
      logger.debug(`Consultando existencia de producto ${codigoProducto} en CONTPAQi...`);

      const response = await this.axiosInstance.get<ContpaqiExistencia>(
        `/api/Productos/existencia`,
        {
          params: {
            codigoProducto,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.warn(`Producto ${codigoProducto} no encontrado en CONTPAQi`);
        return null;
      }
      logger.error(`Error al consultar existencia de producto ${codigoProducto}`, {
        error: error.message,
        status: error.response?.status,
      });
      throw error;
    }
  }

  /**
   * Obtiene un producto por código
   */
  async getProduct(codigoProducto: string): Promise<ContpaqiProduct | null> {
    try {
      logger.debug(`Consultando producto ${codigoProducto} en CONTPAQi...`);

      const response = await this.axiosInstance.get<ContpaqiProduct>(
        `/api/Productos/Obtener`,
        {
          params: {
            codigoProducto,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.warn(`Producto ${codigoProducto} no encontrado en CONTPAQi`);
        return null;
      }
      logger.error(`Error al consultar producto ${codigoProducto}`, {
        error: error.message,
        status: error.response?.status,
      });
      throw error;
    }
  }

  /**
   * Obtiene múltiples productos (si el endpoint lo soporta)
   */
  async getProducts(codigosProductos: string[]): Promise<ContpaqiProduct[]> {
    const products: ContpaqiProduct[] = [];

    for (const codigo of codigosProductos) {
      try {
        const product = await this.getProduct(codigo);
        if (product) {
          products.push(product);
        }
        // Pequeña pausa para evitar rate limiting
        await this.sleep(100);
      } catch (error: any) {
        logger.warn(`Error al obtener producto ${codigo}, continuando...`, error.message);
      }
    }

    return products;
  }

  /**
   * Busca productos por nombre o código (si el endpoint lo soporta)
   */
  async searchProducts(query: string): Promise<ContpaqiProduct[]> {
    try {
      const response = await this.axiosInstance.get<ContpaqiProduct[]>(
        `/api/Productos/Buscar`,
        {
          params: {
            query,
          },
        }
      );

      return Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      // Si el endpoint no existe, retornar array vacío
      if (error.response?.status === 404) {
        logger.debug('Endpoint de búsqueda no disponible en CONTPAQi');
        return [];
      }
      logger.error('Error al buscar productos', {
        error: error.message,
        status: error.response?.status,
      });
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

