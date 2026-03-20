import * as cron from 'node-cron';
import { logger } from '../config/logger';
import { LightspeedAuth } from '../config/auth';
import { ContpaqiAuth } from '../config/contpaqiAuth';
import { CatalogService } from '../services/catalog';
import { InventoryService } from '../services/inventory';
import { SalesService } from '../services/sales';
import { PurchasesService } from '../services/purchases';
import { ContpaqiProductsService } from '../services/contpaqiProducts';
import { ContpaqiDocumentsService } from '../services/contpaqiDocuments';
import { Database } from '../db/models';
import { ContpaqiQueueProcessor } from './queueProcessor';

export class SyncScheduler {
  private auth: LightspeedAuth;
  private contpaqiAuth: ContpaqiAuth | null = null;
  private catalogService: CatalogService;
  private inventoryService: InventoryService;
  private salesService: SalesService;
  private contpaqiProductsService: ContpaqiProductsService | null = null;
  private contpaqiDocumentsService: ContpaqiDocumentsService | null = null;
  private purchasesService: PurchasesService;
  private db: Database;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private queueProcessor: ContpaqiQueueProcessor | null = null;

  constructor() {
    this.auth = new LightspeedAuth();
    const axiosInstance = this.auth.getAxiosInstance();
    const accountId = this.auth.getAccountId();

    this.catalogService = new CatalogService(axiosInstance, accountId);
    this.inventoryService = new InventoryService(axiosInstance, accountId);
    this.salesService = new SalesService(axiosInstance, accountId);
    this.purchasesService = new PurchasesService(axiosInstance, accountId);
    this.db = new Database();

    // Inicializar CONTPAQi solo si las credenciales están disponibles
    try {
      this.contpaqiAuth = new ContpaqiAuth();
      const contpaqiAxios = this.contpaqiAuth.getAxiosInstance();
      this.contpaqiProductsService = new ContpaqiProductsService(contpaqiAxios);
      this.contpaqiDocumentsService = new ContpaqiDocumentsService(contpaqiAxios);
      
      // Crear procesador de cola (pero NO iniciarlo todavía)
      this.queueProcessor = new ContpaqiQueueProcessor(
        this.db,
        this.contpaqiProductsService,
        this.contpaqiDocumentsService
      );
      
      logger.info('Servicios CONTPAQi inicializados correctamente');
    } catch (error: any) {
      logger.warn('CONTPAQi no configurado, la sincronización con CONTPAQi se omitirá', {
        error: error.message,
      });
    }
  }

  async runSync(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Sincronización ya en progreso, omitiendo...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('=== Iniciando sincronización programada ===');

      await this.syncCatalogs();

      if (this.contpaqiProductsService) {
        await this.mapProductsWithContpaqi();
      }

      await this.syncInventory();
      await this.syncSales();
      
      // Procesar ventas, compras y devoluciones directamente a CONTPAQi
      if (this.contpaqiDocumentsService && this.contpaqiProductsService) {
        await this.processSalesToContpaqi();
      }
      await this.syncReturns();
      
      // Intentar sincronizar compras, pero continuar si falla (puede no estar disponible)
      try {
        await this.syncPurchaseOrders();
      } catch (error: any) {
        // Ya se maneja el error dentro de syncPurchaseOrders
        logger.debug('Sincronización de compras omitida o fallida');
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.info(`=== Sincronización completada en ${duration}s ===`);
    } catch (error: any) {
      logger.error('Error durante la sincronización', {
        error: error.message || String(error),
        code: error.code,
        status: error.response?.status,
        stack: error.stack,
      });
      // No lanzar el error para que el scheduler continúe funcionando
      // Solo loguear y continuar
    } finally {
      this.isRunning = false;
    }
  }

  private async syncCatalogs(): Promise<void> {
    try {
      logger.info('--- Sincronizando catálogos ---');

      const lastSync = await this.db.getLastSyncTime('catalogs');
      let catalogs;

      if (lastSync) {
        // Sincronización incremental
        logger.info(`Sincronización incremental desde ${lastSync}`);
        catalogs = await this.catalogService.syncUpdatedCatalogs(lastSync);
      } else {
        // Bootstrap inicial
        logger.info('Bootstrap inicial de catálogos');
        catalogs = await this.catalogService.syncAllCatalogs();
      }

      logger.info(`Guardando ${catalogs.categories.length} categorías...`);
      for (const category of catalogs.categories) {
        if (category.categoryID) {
          await this.db.upsertCategory(category);
        }
      }

      logger.info(`Guardando ${catalogs.itemMatrices.length} matrices de items...`);
      for (const matrix of catalogs.itemMatrices) {
        if (matrix.itemMatrixID) {
          await this.db.upsertItemMatrix(matrix);
        }
      }

      logger.info(`Guardando ${catalogs.items.length} items...`);
      let itemsSaved = 0;
      let itemsSkipped = 0;
      for (const item of catalogs.items) {
        if (item.itemID) {
          try {
            await this.db.upsertItem(item);
            itemsSaved++;
          } catch (error: any) {
            if (error.code === '23503') {
              const detail = error.detail || '';
              logger.warn(`Item ${item.itemID} omitido: ${detail}`);
              itemsSkipped++;
            } else {
              throw error;
            }
          }
        }
      }
      logger.info(`Items guardados: ${itemsSaved}, omitidos: ${itemsSkipped}`);

      const latestTimestamp = this.getLatestTimestamp([
        ...catalogs.categories,
        ...catalogs.itemMatrices,
        ...catalogs.items,
      ]);

      await this.db.updateSyncTime('catalogs', latestTimestamp || undefined);
      logger.info('Catálogos sincronizados correctamente');
    } catch (error: any) {
      logger.error('Error al sincronizar catálogos', error);
      throw error;
    }
  }

  private async syncInventory(): Promise<void> {
    try {
      logger.info('--- Sincronizando inventario de Lightspeed ---');

      const lastSync = await this.db.getLastSyncTime('inventory');
      const inventory = await this.inventoryService.syncInventory(lastSync || undefined);

      let inventorySaved = 0;
      let inventorySkipped = 0;
      
      for (const inv of inventory) {
        if (inv.itemID) {
          try {
            logger.debug(`Sincronizando inventario para item ${inv.itemID}`);
            await this.db.upsertInventory(inv);
            inventorySaved++;
          } catch (error: any) {
            if (error.code === '23503') {
              logger.debug(`Inventario para item ${inv.itemID} omitido: item no existe aún`);
              inventorySkipped++;
            } else {
              throw error;
            }
          }
        }
      }

      logger.info(`Inventario guardado: ${inventorySaved} registros, omitidos: ${inventorySkipped}`);

      const latestTimestamp = this.getLatestTimestamp(inventory);
      await this.db.updateSyncTime('inventory', latestTimestamp || undefined);
      logger.info('Inventario de Lightspeed sincronizado correctamente');
    } catch (error: any) {
      logger.error('Error al sincronizar inventario', error);
      throw error;
    }
  }

  private async mapProductsWithContpaqi(): Promise<void> {
    try {
      logger.info('--- Mapeando productos con CONTPAQi ---');

      if (!this.contpaqiProductsService) {
        logger.info('CONTPAQi no configurado, omitiendo mapeo');
        return;
      }
      
      const username = process.env.CONTAPAQI_USERNAME || '';
      const password = process.env.CONTAPAQI_PASSWORD || '';
      
      if (!username || !password || username === 'your_username' || password === 'your_password') {
        logger.warn('Credenciales de CONTPAQi no configuradas o son valores de ejemplo. Omitiendo mapeo.');
        return;
      }

      const itemsWithoutMapping = await this.db.getItemsWithoutMapping(100);

      // En lugar de procesar directamente, agregar a la cola
      let queuedCount = 0;
      for (const item of itemsWithoutMapping) {
        const codesToTry = [
          item.system_sku,
          item.custom_sku,
          item.upc,
          item.ean,
        ].filter((code) => code);

        for (const code of codesToTry) {
          try {
            await this.db.enqueueContpaqiOperation(
              'map_product',
              {
                itemId: item.item_id,
                code: code,
              },
              5
            );
            queuedCount++;
            break;
          } catch (error: any) {
            logger.error(`Error al agregar mapeo a cola para item ${item.item_id}: ${error.message}`);
          }
        }
      }

      logger.info(`Mapeo: ${queuedCount} productos agregados a la cola para procesamiento`);
    } catch (error: any) {
      logger.error('Error al mapear productos con CONTPAQi', error);
      // No lanzar error, solo loguear para no detener la sincronización
    }
  }

  /**
   * Procesa ventas de Lightspeed y las envía directamente a CONTPAQi
   */
  private async processSalesToContpaqi(): Promise<void> {
    try {
      logger.info('--- Procesando ventas para CONTPAQi ---');

      // Obtener ventas no procesadas aún
      const sales = await this.db.query(`
        SELECT s.*, 
               COALESCE(
                 json_agg(sl.*) FILTER (WHERE sl.sale_line_id IS NOT NULL),
                 '[]'::json
               ) as sale_lines
        FROM sales s
        LEFT JOIN sale_lines sl ON s.sale_id = sl.sale_id
        WHERE s.voided = FALSE 
          AND s.archived = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM contpaqi_queue 
            WHERE operation_type = 'process_document' 
            AND payload->>'Referencia' = COALESCE(s.reference_number::text, s.sale_number::text, s.sale_id::text)
            AND status = 'completed'
          )
        GROUP BY s.sale_id
        LIMIT 50
      `);

      logger.info(`Encontradas ${sales.rows.length} ventas para procesar`);

      let procesadas = 0;
      let agregadasACola = 0;
      let sinMovimientos = 0;

      for (const sale of sales.rows) {
        procesadas++;
        const resultado = await this.processSaleToContpaqi(sale);
        if (resultado === 'agregada') {
          agregadasACola++;
        } else if (resultado === 'sin_movimientos') {
          sinMovimientos++;
        }
      }

      logger.info(`Procesamiento completado: ${procesadas} procesadas, ${agregadasACola} agregadas a cola, ${sinMovimientos} sin movimientos válidos`);
    } catch (error: any) {
      logger.error('Error al procesar ventas para CONTPAQi', error);
    }
  }

  /**
   * Procesa una venta individual y la envía a CONTPAQi
   * Retorna: 'agregada' | 'sin_movimientos' | 'error'
   */
  private async processSaleToContpaqi(sale: any): Promise<'agregada' | 'sin_movimientos' | 'error'> {
    try {
      // Primero intentar obtener las líneas desde la base de datos (ya sincronizadas)
      const saleLinesFromDb = await this.db.query(
        'SELECT * FROM sale_lines WHERE sale_id = $1',
        [sale.sale_id]
      );

      let saleLines: any[] = [];
      
      if (saleLinesFromDb.rows.length > 0) {
        // Usar líneas de la base de datos
        saleLines = saleLinesFromDb.rows;
        logger.info(`Venta ${sale.sale_id}: usando ${saleLines.length} líneas desde BD`);
      } else {
        // Si no hay en BD, obtener desde API
        logger.info(`Venta ${sale.sale_id}: no hay líneas en BD, obteniendo desde API...`);
        const saleData = await this.salesService.getSale(sale.sale_id);
        
        if (!saleData) {
          logger.warn(`Venta ${sale.sale_id} no encontrada en Lightspeed API`);
          return 'sin_movimientos';
        }
        
        // Log detallado para debug
        logger.info(`Venta ${sale.sale_id} obtenida desde API`, {
          tieneSaleData: !!saleData,
          tieneSaleLine: !!saleData?.SaleLine,
          tieneSaleLines: !!saleData?.SaleLines,
          tieneSaleLinesSaleLine: !!saleData?.SaleLines?.SaleLine,
          keys: saleData ? Object.keys(saleData) : [],
          rawData: saleData ? JSON.stringify(saleData).substring(0, 1000) : 'null'
        });
        
        // Buscar líneas en SaleLines.SaleLine (formato nuevo) o SaleLine (formato antiguo)
        let apiSaleLines: any[] = [];
        
        if (saleData.SaleLines?.SaleLine) {
          // Formato nuevo: SaleLines.SaleLine
          const lines = saleData.SaleLines.SaleLine;
          apiSaleLines = Array.isArray(lines) ? lines : [lines];
          logger.info(`Venta ${sale.sale_id}: encontradas ${apiSaleLines.length} líneas en SaleLines.SaleLine`);
        } else if (saleData.SaleLine) {
          // Formato antiguo: SaleLine directo
          apiSaleLines = Array.isArray(saleData.SaleLine) 
            ? saleData.SaleLine 
            : [saleData.SaleLine];
          logger.info(`Venta ${sale.sale_id}: encontradas ${apiSaleLines.length} líneas en SaleLine`);
        } else {
          logger.warn(`Venta ${sale.sale_id} sin líneas en respuesta de API (ni SaleLine ni SaleLines.SaleLine)`);
          return 'sin_movimientos';
        }
        
        // Convertir formato API a formato BD
        saleLines = apiSaleLines.map((line: any) => ({
          item_id: line.itemID,
          unit_quantity: line.unitQuantity,
          unit_price: line.unitPrice,
          sale_line_id: line.saleLineID
        }));
      }

      logger.info(`Procesando venta ${sale.sale_id}: ${saleLines.length} líneas`);

      if (saleLines.length === 0) {
        return 'sin_movimientos';
      }

      // Crear movimientos directamente desde Lightspeed sin validaciones
      const movimientos: Array<{
        Producto: string;
        Cantidad: number;
        Precio: number;
        Almacen?: string;
      }> = [];

      for (const line of saleLines) {
        // Manejar tanto formato BD como formato API
        const cantidad = parseFloat(line.unit_quantity || line.unitQuantity || '0');
        const precio = parseFloat(line.unit_price || line.unitPrice || '0');
        const itemId = line.item_id || line.itemID;

        // Usar itemID directamente como código de producto, o buscar código en items
        let productoId = itemId || 'SIN_CODIGO';
        
        if (itemId) {
          try {
            const itemResult = await this.db.query(
              'SELECT system_sku, custom_sku, upc FROM items WHERE item_id = $1 LIMIT 1',
              [itemId]
            );
            if (itemResult.rows.length > 0) {
              const item = itemResult.rows[0];
              productoId = item.custom_sku || item.system_sku || item.upc || itemId;
            }
          } catch (error) {
            // Si falla, usar itemID directamente
            productoId = itemId;
          }
        }

        // Enviar todo sin importar cantidad o precio
        movimientos.push({
          Producto: String(productoId),
          Cantidad: cantidad || 0,
          Precio: precio || 0,
        });
      }

      if (movimientos.length > 0) {
        const conceptoId = 'LVEN'; // Concepto específico para ventas
        const clienteId = '1'; // Valor fijo según requerimiento
        const coordenadas = '1'; // Valor fijo según requerimiento
        const fecha = sale.complete_time || sale.create_time || new Date();
        const fechaISO = new Date(fecha).toISOString().replace('Z', '');
        const agente = process.env.CONTAPAQI_AGENTE || 'Sistema de Sincronización';

        const documento = {
          Concepto: conceptoId,
          Cliente: clienteId,
          Coordenadas: coordenadas,
          Fecha: fechaISO,
          Observacion: `Venta desde Lightspeed - ${sale.sale_number || sale.sale_id}`,
          Referencia: sale.reference_number || sale.sale_number || sale.sale_id,
          Agente: agente,
          Movimientos: movimientos.map((mov) => ({
            ...mov,
            Almacen: mov.Almacen || '1',
          })),
        };

        await this.db.enqueueContpaqiOperation('process_document', documento, 8);
        logger.info(`Venta ${sale.sale_id} agregada a cola CONTPAQi: ${movimientos.length} movimientos`);
        return 'agregada';
      } else {
        return 'sin_movimientos';
      }
    } catch (error: any) {
      logger.error(`Error al procesar venta ${sale.sale_id} para CONTPAQi`, error);
      return 'error';
    }
  }

  private async syncSales(): Promise<void> {
    try {
      logger.info('--- Sincronizando ventas ---');

      const lastSync = await this.db.getLastSyncTime('sales');
      const sales = await this.salesService.getSales(lastSync || undefined);

      let salesSaved = 0;
      let salesSkipped = 0;

      for (const sale of sales) {
        if (sale.saleID) {
          try {
            await this.db.upsertSale(sale);
            salesSaved++;
          } catch (error: any) {
            logger.warn(`Error al guardar venta ${sale.saleID}: ${error.message}`);
            salesSkipped++;
          }
        }
      }

      const latestTimestamp = this.getLatestTimestamp(sales);
      await this.db.updateSyncTime('sales', latestTimestamp || undefined);
      logger.info(`Ventas sincronizadas: ${salesSaved} guardadas, ${salesSkipped} omitidas (total: ${sales.length})`);
    } catch (error: any) {
      logger.error('Error al sincronizar ventas', error);
      // No lanzar error para no detener la sincronización completa
    }
  }

  private async syncReturns(): Promise<void> {
    try {
      logger.info('--- Sincronizando devoluciones ---');

      const lastSync = await this.db.getLastSyncTime('returns');
      const returns = await this.salesService.getReturns(lastSync || undefined);

      let returnsSaved = 0;
      let returnsSkipped = 0;

      for (const returnSale of returns) {
        if (returnSale.saleID) {
          try {
            await this.db.upsertReturn(returnSale);
            returnsSaved++;
            
            if (this.contpaqiDocumentsService && this.contpaqiProductsService) {
              await this.processReturnToContpaqi(returnSale);
            }
          } catch (error: any) {
            logger.warn(`Error al guardar devolución ${returnSale.saleID}: ${error.message}`);
            returnsSkipped++;
          }
        }
      }

      const latestTimestamp = this.getLatestTimestamp(returns);
      await this.db.updateSyncTime('returns', latestTimestamp || undefined);
      logger.info(`Devoluciones sincronizadas: ${returnsSaved} guardadas, ${returnsSkipped} omitidas (total: ${returns.length})`);
    } catch (error: any) {
      logger.error('Error al sincronizar devoluciones', error);
      // No lanzar error para no detener la sincronización completa
    }
  }

  private async syncPurchaseOrders(): Promise<void> {
    try {
      logger.info('--- Sincronizando órdenes de compra ---');

      const lastSync = await this.db.getLastSyncTime('purchase_orders');
      const purchaseOrders = await this.purchasesService.syncPurchaseOrders(lastSync || undefined);

      for (const po of purchaseOrders) {
        if (po.purchaseOrderID) {
          await this.db.upsertPurchaseOrder(po);
          
          if (this.contpaqiDocumentsService && this.contpaqiProductsService) {
            await this.processPurchaseOrderToContpaqi(po);
          }
        }
      }

      const latestTimestamp = this.getLatestTimestamp(purchaseOrders);
      await this.db.updateSyncTime('purchase_orders', latestTimestamp || undefined);
      logger.info(`Órdenes de compra sincronizadas correctamente: ${purchaseOrders.length}`);
    } catch (error: any) {
      // Si el endpoint no existe (404), solo logueamos un warning y continuamos
      if (error.response?.status === 404 || error.status === 404) {
        logger.warn('Endpoint de PurchaseOrder no disponible en esta cuenta de Lightspeed. Se omitirá la sincronización de compras.', {
          message: error.message || error.response?.data?.message,
        });
      } else {
        logger.error('Error al sincronizar órdenes de compra', error);
      }
    }
  }

  private async processReturnToContpaqi(returnSale: any): Promise<void> {
    try {
      const saleLines = Array.isArray(returnSale.SaleLine) 
        ? returnSale.SaleLine 
        : returnSale.SaleLine 
          ? [returnSale.SaleLine] 
          : [];

      const movimientos: Array<{
        Producto: string;
        Cantidad: number;
        Precio: number;
        Almacen?: string;
      }> = [];

      for (const line of saleLines) {
        if (line.itemID && (line.returned === 'true' || parseFloat(line.unitQuantity || '0') < 0)) {
          const mapping = await this.db.getProductMapping(line.itemID);
          if (mapping) {
            const contpaqiProduct = await this.contpaqiProductsService?.getProduct(mapping.contpaqiCodigo);
            if (contpaqiProduct) {
              const quantity = Math.abs(parseFloat(line.unitQuantity || '0'));
              const precio = parseFloat(line.unitPrice || '0');
              
              movimientos.push({
                Producto: contpaqiProduct.CodigoProducto || mapping.contpaqiCodigo,
                Cantidad: -quantity, // Negativo para devolución
                Precio: precio || 0,
              });
            }
          }
        }
      }

      if (movimientos.length > 0) {
        const conceptoId = 'LDEV'; // Concepto específico para devoluciones
        const clienteId = '1'; // Valor fijo según requerimiento
        const coordenadas = '1'; // Valor fijo según requerimiento
        const fecha = returnSale.completeTime || returnSale.createTime || new Date();
        const fechaISO = new Date(fecha).toISOString().replace('Z', '');
        const agente = process.env.CONTAPAQI_AGENTE || 'Sistema de Sincronización';

        await this.db.enqueueContpaqiOperation(
          'process_document',
          {
            Concepto: conceptoId,
            Cliente: clienteId,
            Coordenadas: coordenadas,
            Fecha: fechaISO,
            Observacion: `Devolución desde Lightspeed - ${returnSale.saleNumber || returnSale.saleID}`,
            Referencia: returnSale.referenceNumber || returnSale.saleNumber || returnSale.saleID,
            Agente: agente,
            Movimientos: movimientos.map((mov) => ({
              ...mov,
              Almacen: mov.Almacen || '1',
            })),
          },
          8
        );
        logger.info(`Devolución ${returnSale.saleID} agregada a cola CONTPAQi con ${movimientos.length} movimientos`);
      }
    } catch (error: any) {
      logger.error(`Error al procesar devolución ${returnSale.saleID} para CONTPAQi`, error);
    }
  }

  private async processPurchaseOrderToContpaqi(po: any): Promise<void> {
    try {
      const purchaseOrderLines = Array.isArray(po.PurchaseOrderLine) 
        ? po.PurchaseOrderLine 
        : po.PurchaseOrderLine 
          ? [po.PurchaseOrderLine] 
          : [];

      const movimientos: Array<{
        Producto: string;
        Cantidad: number;
        Precio: number;
        Almacen?: string;
      }> = [];

      for (const line of purchaseOrderLines) {
        if (line.itemID) {
          const mapping = await this.db.getProductMapping(line.itemID);
          if (mapping) {
            const contpaqiProduct = await this.contpaqiProductsService?.getProduct(mapping.contpaqiCodigo);
            if (contpaqiProduct) {
              const quantity = parseFloat(line.quantityReceived || line.quantity || '0');
              const precio = parseFloat(line.cost || '0');
              
              if (quantity > 0) {
                movimientos.push({
                  Producto: contpaqiProduct.CodigoProducto || mapping.contpaqiCodigo,
                  Cantidad: quantity,
                  Precio: precio || 0,
                });
              }
            }
          }
        }
      }

      if (movimientos.length > 0) {
        const conceptoId = 'LCOM'; // Concepto específico para compras
        const proveedorId = po.vendorID || '1';
        const coordenadas = '1'; // Valor fijo según requerimiento
        const fecha = po.completeTime || po.createTime || new Date();
        const fechaISO = new Date(fecha).toISOString().replace('Z', '');
        const agente = process.env.CONTAPAQI_AGENTE || 'Sistema de Sincronización';

        await this.db.enqueueContpaqiOperation(
          'process_document',
          {
            Concepto: conceptoId,
            Cliente: proveedorId,
            Coordenadas: coordenadas,
            Fecha: fechaISO,
            Observacion: `Compra desde Lightspeed - ${po.purchaseOrderNumber || po.purchaseOrderID}`,
            Referencia: po.purchaseOrderNumber || po.purchaseOrderID,
            Agente: agente,
            Movimientos: movimientos.map((mov) => ({
              ...mov,
              Almacen: mov.Almacen || '1',
            })),
          },
          8
        );
        logger.info(`Orden de compra ${po.purchaseOrderID} agregada a cola CONTPAQi con ${movimientos.length} movimientos`);
      }
    } catch (error: any) {
      logger.error(`Error al procesar orden de compra ${po.purchaseOrderID} para CONTPAQi`, error);
    }
  }

  private getLatestTimestamp(items: Array<{ timeStamp?: string }>): string | null {
    if (items.length === 0) {
      return null;
    }

    const timestamps = items
      .map((item) => item.timeStamp)
      .filter((ts): ts is string => !!ts)
      .map((ts) => new Date(ts).getTime())
      .filter((ts) => !isNaN(ts));

    if (timestamps.length === 0) {
      return null;
    }

    const latest = Math.max(...timestamps);
    return new Date(latest).toISOString();
  }

  /**
   * Inicia el scheduler con cron
   */
  start(): void {
    const cronExpression =
      process.env.POLLING_CRON_EXPRESSION || '0 */3 * * *'; // Cada 3 horas por defecto

    logger.info(`Iniciando scheduler con expresión cron: ${cronExpression}`);

    this.runSync().catch((error) => {
      logger.error('Error en sincronización inicial', error);
    });

    this.cronJob = cron.schedule(cronExpression, () => {
      logger.info('Ejecutando sincronización programada...');
      this.runSync().catch((error) => {
        logger.error('Error en sincronización programada', error);
      });
    });

    logger.info('Scheduler iniciado correctamente');
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Scheduler detenido');
    }
    if (this.queueProcessor) {
      this.queueProcessor.stop();
    }
  }

  async initializeDatabase(): Promise<void> {
    await this.db.initialize();
    
    // Iniciar procesador de cola DESPUÉS de inicializar la base de datos
    if (this.queueProcessor) {
      this.queueProcessor.start();
      logger.info('Procesador de cola CONTPAQi iniciado');
    }
  }

  async close(): Promise<void> {
    this.stop();
    await this.db.close();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

