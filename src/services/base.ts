import { AxiosInstance } from 'axios';
import { logger } from '../config/logger';

export interface PaginatedResponse<T> {
  '@attributes'?: {
    count?: string;
    offset?: string;
    limit?: string;
  };
  '@pagination'?: {
    currentPage?: string;
    perPage?: string;
    total?: string;
    count?: string;
  };
  '@next'?: string;
  '@previous'?: string;
  [key: string]: T[] | any;
}

export interface RateLimiter {
  requests: number[];
  maxRequests: number;
  windowMs: number;
}

export class BaseService {
  protected axiosInstance: AxiosInstance;
  protected accountId: string;
  private static globalRateLimiter: RateLimiter | null = null;
  private rateLimiter: RateLimiter;

  constructor(axiosInstance: AxiosInstance, accountId: string) {
    this.axiosInstance = axiosInstance;
    this.accountId = accountId;

    if (!BaseService.globalRateLimiter) {
      const perSecondConfig = parseInt(process.env.RATE_LIMIT_REQUESTS_PER_SECOND || '299', 10);
      const perSecond = Number.isNaN(perSecondConfig) || perSecondConfig < 1 ? 299 : perSecondConfig;
      const maxPerSecond = Math.min(perSecond, 299); // Garantiza no pasar de 299 por segundo

      const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '1000', 10);
      const rateWindowMs = Number.isNaN(windowMs) || windowMs < 1 ? 1000 : windowMs;

      BaseService.globalRateLimiter = {
        requests: [],
        maxRequests: maxPerSecond,
        windowMs: rateWindowMs,
      };
    }

    this.rateLimiter = BaseService.globalRateLimiter;
  }

  /**
   * Maneja rate limiting con backoff exponencial
   */
  protected async rateLimit(): Promise<void> {
    const now = Date.now();
    const backoffMs = parseInt(process.env.RATE_LIMIT_BACKOFF_MS || '1000', 10);

    this.rateLimiter.requests = this.rateLimiter.requests.filter(
      (timestamp) => now - timestamp < this.rateLimiter.windowMs
    );

    if (this.rateLimiter.requests.length >= this.rateLimiter.maxRequests) {
      const oldestRequest = this.rateLimiter.requests[0];
      const waitTime = this.rateLimiter.windowMs - (now - oldestRequest) + backoffMs;
      logger.warn(`Rate limit alcanzado. Esperando ${waitTime}ms`);
      await this.sleep(waitTime);
      return this.rateLimit();
    }

    this.rateLimiter.requests.push(now);
  }

  /**
   * Realiza una petición GET con manejo de rate limiting y reintentos
   */
  protected async get<T>(
    endpoint: string,
    params?: Record<string, any>,
    retries: number = 3
  ): Promise<T> {
    await this.rateLimit();

    try {
      const response = await this.axiosInstance.get<T>(endpoint, { params });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 429 && retries > 0) {
        // Rate limit, esperar y reintentar
        const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
        logger.warn(`Rate limit 429. Reintentando después de ${retryAfter}s`);
        await this.sleep(retryAfter * 1000);
        return this.get<T>(endpoint, params, retries - 1);
      }

      if (error.response?.status >= 500 && retries > 0) {
        // Error del servidor, reintentar con backoff exponencial
        const backoffMs = Math.pow(2, 3 - retries) * 1000;
        logger.warn(`Error del servidor. Reintentando después de ${backoffMs}ms`);
        await this.sleep(backoffMs);
        return this.get<T>(endpoint, params, retries - 1);
      }

      throw error;
    }
  }

  /**
   * Obtiene todos los resultados paginados de un endpoint
   * Usa las URLs next/previous proporcionadas por la API en lugar de offset
   */
  protected async getAllPaginated<T>(
    endpoint: string,
    params: Record<string, any> = {},
    limit: number = 100
  ): Promise<T[]> {
    const allResults: T[] = [];
    let nextUrl: string | null = null;
    let isFirstRequest = true;

    while (true) {
      let response: PaginatedResponse<T>;
      
      if (isFirstRequest) {
        // Primera petición: usar endpoint y params originales (sin offset)
        const requestParams = { ...params };
        // Solo incluir limit si no hay otros parámetros de filtro
        if (Object.keys(requestParams).length === 0) {
          requestParams.limit = limit;
        }
        response = await this.get<PaginatedResponse<T>>(endpoint, requestParams);
        isFirstRequest = false;
      } else if (nextUrl) {
        // Peticiones siguientes: usar la URL next completa
        // Extraer el path de la URL completa
        const url = new URL(nextUrl);
        const path = url.pathname + url.search;
        response = await this.get<PaginatedResponse<T>>(path);
      } else {
        // No hay más páginas
        break;
      }

      // Extraer los items del response
      const items = this.extractItemsFromResponse<T>(response);
      allResults.push(...items);

      // Obtener la URL de la siguiente página
      // La API de Lightspeed puede devolver @next de diferentes formas
      const nextValue = response['@next'];
      
      // Log para debugging - ver qué estructura tiene la respuesta
      if (isFirstRequest) {
        logger.debug(`Estructura de respuesta paginada:`, {
          keys: Object.keys(response).filter(k => k.startsWith('@')),
          hasNext: !!nextValue,
          nextType: typeof nextValue,
        });
      }
      
      if (typeof nextValue === 'string' && nextValue) {
        nextUrl = nextValue;
      } else if (typeof nextValue === 'object' && nextValue) {
        // Si es un objeto, puede tener href o @attributes
        if (nextValue['href']) {
          nextUrl = nextValue['href'];
        } else if (nextValue['@attributes'] && nextValue['@attributes']['href']) {
          nextUrl = nextValue['@attributes']['href'];
        } else {
          nextUrl = null;
        }
      } else {
        nextUrl = null;
      }

      const attributes = response['@attributes'];
      const count = attributes?.count ? parseInt(attributes.count, 10) : 0;
      
      logger.info(`Página obtenida: ${items.length} items, total acumulado: ${allResults.length}, total en API: ${count || 'desconocido'}, siguiente página: ${nextUrl ? 'sí' : 'no'}`);

      // Si no hay URL next, terminamos
      if (!nextUrl) {
        // Si tenemos count y ya obtuvimos todos, terminamos
        if (count > 0 && allResults.length >= count) {
          logger.info(`Paginación completa: obtenidos todos los ${count} items`);
        } else if (items.length === 0) {
          // Si no hay items en esta página, terminamos
          logger.info('No hay más items en la siguiente página');
        } else {
          // Si hay items pero no hay @next, puede ser que la API no lo devuelva
          // Intentar continuar solo si tenemos menos items de los esperados
          if (count > 0 && allResults.length < count) {
            logger.warn(`No se encontró URL @next pero faltan items. Obtenidos: ${allResults.length}, esperados: ${count}`);
            logger.warn(`Estructura de respuesta:`, {
              hasAttributes: !!response['@attributes'],
              attributeKeys: response['@attributes'] ? Object.keys(response['@attributes']) : [],
              responseKeys: Object.keys(response).filter(k => k.startsWith('@')),
            });
          }
        }
        break;
      }
      
      // Pequeña pausa entre páginas para evitar rate limiting
      await this.sleep(100);
    }

    return allResults;
  }

  /**
   * Extrae los items de una respuesta paginada
   * La respuesta puede tener diferentes estructuras según el endpoint
   */
  private extractItemsFromResponse<T>(response: PaginatedResponse<T>): T[] {
    // Buscar la key que contiene el array de items (excluyendo @attributes)
    const keys = Object.keys(response).filter((key) => key !== '@attributes');
    
    if (keys.length === 0) {
      return [];
    }

    // Generalmente el primer key que no es @attributes contiene el array
    const itemsKey = keys[0];
    const items = response[itemsKey];

    // Si es un array, retornarlo directamente
    if (Array.isArray(items)) {
      return items;
    }

    // Si es un objeto único, convertirlo a array
    if (items && typeof items === 'object') {
      return [items as T];
    }

    return [];
  }

  /**
   * Utilidad para sleep
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

