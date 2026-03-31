import { logger } from '../config/logger';
import { Database } from '../db/models';
import { ContpaqiProductsService } from '../services/contpaqiProducts';
import { ContpaqiDocumentsService } from '../services/contpaqiDocuments';

export class ContpaqiQueueProcessor {
  private db: Database;
  private contpaqiProductsService: ContpaqiProductsService | null;
  private contpaqiDocumentsService: ContpaqiDocumentsService | null;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 5; // Procesar 5 operaciones a la vez
  private readonly PROCESSING_INTERVAL_MS = 5000; // Revisar cada 5 segundos

  constructor(
    db: Database,
    contpaqiProductsService: ContpaqiProductsService | null,
    contpaqiDocumentsService: ContpaqiDocumentsService | null
  ) {
    this.db = db;
    this.contpaqiProductsService = contpaqiProductsService;
    this.contpaqiDocumentsService = contpaqiDocumentsService;
  }

  start(): void {
    if (this.processingInterval) {
      logger.warn('Procesador de cola ya está corriendo');
      return;
    }

    logger.info('Iniciando procesador de cola CONTPAQi...');
    this.processQueue();
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.PROCESSING_INTERVAL_MS);
  }

  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('Procesador de cola detenido');
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    if (!this.contpaqiProductsService || !this.contpaqiDocumentsService) {
      return;
    }

    this.isProcessing = true;

    try {
      const operations = await this.db.getPendingQueueOperations(this.BATCH_SIZE);

      if (operations.length === 0) {
        this.isProcessing = false;
        return;
      }

      logger.debug(`Procesando ${operations.length} operaciones de la cola CONTPAQi`);

      const promises = operations.map(op => this.processOperation(op));
      await Promise.allSettled(promises);

      const stats = await this.db.getQueueStats();
      logger.debug(`Estado de cola: ${stats.pending} pendientes, ${stats.failed} fallidas, ${stats.completed} completadas`);
    } catch (error: any) {
      logger.error('Error al procesar cola CONTPAQi', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processOperation(operation: {
    id: number;
    operationType: string;
    payload: any;
    retryCount: number;
    maxRetries: number;
  }): Promise<void> {
    try {
      switch (operation.operationType) {
        case 'map_product':
          await this.processMapProduct(operation);
          break;
        case 'process_document':
        case 'process_purchase':
        case 'process_return':
          await this.processDocument(operation);
          break;
        default:
          throw new Error(`Tipo de operación desconocido: ${operation.operationType}`);
      }
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      logger.error(`Error al procesar operación ${operation.id} (${operation.operationType}): ${errorMessage}`);
      
      await this.db.markQueueOperationFailed(
        operation.id,
        errorMessage,
        operation.retryCount,
        operation.maxRetries
      );
    }
  }

  private async processMapProduct(operation: {
    id: number;
    payload: any;
  }): Promise<void> {
    const { itemId, code } = operation.payload;
    
    if (!this.contpaqiProductsService) {
      throw new Error('ContpaqiProductsService no disponible');
    }

    const contpaqiProduct = await this.contpaqiProductsService.getProduct(code);
    
    if (contpaqiProduct && contpaqiProduct.CodigoProducto) {
      await this.db.upsertProductMapping(
        itemId,
        contpaqiProduct.CodigoProducto,
        'auto',
        `Mapeo automático usando código: ${code}`
      );
      await this.db.markQueueOperationCompleted(operation.id, {
        mapped: true,
        contpaqiCodigo: contpaqiProduct.CodigoProducto,
      });
      logger.debug(`Mapeado desde cola: ${itemId} -> ${contpaqiProduct.CodigoProducto}`);
    } else {
      await this.db.markQueueOperationCompleted(operation.id, {
        mapped: false,
        reason: `Producto ${code} no encontrado en CONTPAQi (no crítico)`,
      });
      logger.debug(`Producto ${code} no encontrado en CONTPAQi, omitiendo mapeo`);
    }
  }

  private async processSyncInventory(operation: {
    id: number;
    payload: any;
  }): Promise<void> {
    const { itemId, contpaqiCodigo, lightspeedQty } = operation.payload;
    
    if (!this.contpaqiProductsService) {
      throw new Error('ContpaqiProductsService no disponible');
    }

    const contpaqiExistencia = await this.contpaqiProductsService.getProductExistencia(contpaqiCodigo);
    
    if (!contpaqiExistencia) {
      throw new Error(`Producto ${contpaqiCodigo} no encontrado en CONTPAQi`);
    }

    const contpaqiQty = contpaqiExistencia.Existencia || 0;
    const diferencia = lightspeedQty - contpaqiQty;

    // Log de sincronización
    await this.db.logContpaqiSync(
      'inventory_sync',
      itemId,
      contpaqiCodigo,
      lightspeedQty,
      contpaqiQty,
      diferencia,
      null,
      true,
      undefined
    );

    await this.db.markQueueOperationCompleted(operation.id, {
      synced: true,
      diferencia,
    });
  }

  private async processDocument(operation: {
    id: number;
    payload: any;
  }): Promise<void> {
    if (!this.contpaqiDocumentsService) {
      throw new Error('ContpaqiDocumentsService no disponible');
    }

    const documento = operation.payload;
    
    if (!documento.Movimientos || documento.Movimientos.length === 0) {
      throw new Error('Documento sin movimientos');
    }

    // El documento ya viene en el formato correcto desde el scheduler
    const documentoContpaqi = {
      Concepto: documento.Concepto,
      Cliente: documento.Cliente,
      Fecha: documento.Fecha || new Date().toISOString().replace('Z', ''),
      Observacion: documento.Observacion,
      Referencia: documento.Referencia,
      Agente: documento.Agente || 'Sistema de Sincronización',
      Movimientos: documento.Movimientos.map((m: any) => ({
        Producto: m.Producto || m.CodigoProducto, // Compatibilidad con formato antiguo
        Cantidad: m.Cantidad,
        Precio: m.Precio || 0, // Precio es requerido
      })),
    };

    // Filtrar documentos hasta 2025 inclusive
    const fechaDocumento = new Date(documentoContpaqi.Fecha);
    if (isNaN(fechaDocumento.getTime())) {
      throw new Error(`Fecha de documento inválida: ${documentoContpaqi.Fecha}`);
    }

    if (fechaDocumento.getUTCFullYear() < 2026) {
      logger.info(`Documento omitido porque fecha ${documentoContpaqi.Fecha} es anterior a 2026`);
      await this.db.markQueueOperationCompleted(operation.id, {
        skipped: true,
        reason: 'Fecha anterior a 2026',
        fecha: documentoContpaqi.Fecha,
      });
      return;
    }

    // El retorno es un String (mensaje de confirmación)
    const response = await this.contpaqiDocumentsService.procesarDocumento(documentoContpaqi);

    await this.db.markQueueOperationCompleted(operation.id, {
      mensaje: response,
      success: true,
    });

    logger.info(`Documento procesado desde cola: ${response}`);
  }

  private isFecha2026EnAdelante(fechaIso: string): boolean {
    const fecha = new Date(fechaIso);
    if (isNaN(fecha.getTime())) {
      return false;
    }
    return fecha.getUTCFullYear() >= 2026;
  }
}

