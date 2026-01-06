import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import { logger } from '../config/logger';
import { Category, ItemMatrix, Item } from '../services/catalog';
import { Inventory } from '../services/inventory';
import { Sale, SaleLine } from '../services/sales';
import { PurchaseOrder, PurchaseOrderLine } from '../services/purchases';

dotenv.config();

export class Database {
  private pool: Pool;

  constructor() {
    // Soporta tanto DB_* como DATABASE_* para compatibilidad
    const dbConfig = {
      host: process.env.DATABASE_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || process.env.DB_PORT || '5432', 10),
      database: process.env.DATABASE_NAME || process.env.DB_NAME || 'lightspeed_sync',
      user: process.env.DATABASE_USER || process.env.DB_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '',
    };

    logger.info('Configurando conexión a PostgreSQL', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
    });

    this.pool = new Pool(dbConfig);

    this.pool.on('error', (err) => {
      logger.error('Error inesperado en el pool de PostgreSQL', err);
    });
  }

  async initialize(): Promise<void> {
    logger.info('Intentando conectar a PostgreSQL...');
    
    let client;
    try {
      client = await this.pool.connect();
      logger.info('Conexión a PostgreSQL establecida correctamente');
    } catch (error: any) {
      logger.error('Error al conectar a PostgreSQL', {
        error: error.message,
        code: error.code,
        host: process.env.DATABASE_HOST || process.env.DB_HOST || 'localhost',
        port: process.env.DATABASE_PORT || process.env.DB_PORT || '5432',
        database: process.env.DATABASE_NAME || process.env.DB_NAME || 'lightspeed_sync',
      });
      
      if (error.code === 'ECONNREFUSED') {
        throw new Error(
          `No se pudo conectar a PostgreSQL en ${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || '5432'}. ` +
          `Verifica que PostgreSQL esté corriendo y que las credenciales en .env sean correctas.`
        );
      }
      throw error;
    }

    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TABLE IF NOT EXISTS categories (
          category_id VARCHAR(255) PRIMARY KEY,
          name TEXT,
          node_depth INTEGER,
          full_path_name TEXT,
          left_node INTEGER,
          right_node INTEGER,
          create_time TIMESTAMP,
          time_stamp TIMESTAMP,
          raw_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS item_matrices (
          item_matrix_id VARCHAR(255) PRIMARY KEY,
          description TEXT,
          tax DECIMAL(10, 2),
          default_cost DECIMAL(10, 2),
          item_type VARCHAR(50),
          time_stamp TIMESTAMP,
          raw_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS items (
          item_id VARCHAR(255) PRIMARY KEY,
          system_sku VARCHAR(255),
          default_cost DECIMAL(10, 2),
          avg_cost DECIMAL(10, 2),
          discountable BOOLEAN,
          tax DECIMAL(10, 2),
          archived BOOLEAN,
          item_type VARCHAR(50),
          serialized BOOLEAN,
          description TEXT,
          model_year INTEGER,
          upc VARCHAR(255),
          ean VARCHAR(255),
          custom_sku VARCHAR(255),
          manufacturer_sku VARCHAR(255),
          create_time TIMESTAMP,
          time_stamp TIMESTAMP,
          category_id VARCHAR(255),
          item_matrix_id VARCHAR(255),
          raw_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE SET NULL,
          FOREIGN KEY (item_matrix_id) REFERENCES item_matrices(item_matrix_id) ON DELETE SET NULL
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS inventory (
          id SERIAL PRIMARY KEY,
          item_id VARCHAR(255) NOT NULL,
          qoh INTEGER DEFAULT 0,
          qoo INTEGER DEFAULT 0,
          qbo INTEGER DEFAULT 0,
          qs INTEGER DEFAULT 0,
          qsbo INTEGER DEFAULT 0,
          time_stamp TIMESTAMP,
          raw_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
          UNIQUE(item_id)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS sales (
          sale_id VARCHAR(255) PRIMARY KEY,
          sale_number VARCHAR(255),
          create_time TIMESTAMP,
          time_stamp TIMESTAMP,
          update_time TIMESTAMP,
          complete_time TIMESTAMP,
          reference_number VARCHAR(255),
          reference_number_source VARCHAR(50),
          tax_category_id VARCHAR(255),
          employee_id VARCHAR(255),
          register_id VARCHAR(255),
          shop_id VARCHAR(255),
          customer_id VARCHAR(255),
          discount_percent DECIMAL(10, 2),
          discount_amount DECIMAL(10, 2),
          subtotal DECIMAL(10, 2),
          total DECIMAL(10, 2),
          total_due DECIMAL(10, 2),
          total_tax DECIMAL(10, 2),
          archived BOOLEAN DEFAULT FALSE,
          voided BOOLEAN DEFAULT FALSE,
          raw_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS sale_lines (
          sale_line_id VARCHAR(255) PRIMARY KEY,
          sale_id VARCHAR(255) NOT NULL,
          unit_quantity INTEGER,
          unit_price DECIMAL(10, 2),
          normal_unit_price DECIMAL(10, 2),
          discount_amount DECIMAL(10, 2),
          item_id VARCHAR(255),
          returned BOOLEAN DEFAULT FALSE,
          time_stamp TIMESTAMP,
          raw_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE,
          FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE SET NULL
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS purchase_orders (
          purchase_order_id VARCHAR(255) PRIMARY KEY,
          purchase_order_number VARCHAR(255),
          vendor_id VARCHAR(255),
          create_time TIMESTAMP,
          time_stamp TIMESTAMP,
          update_time TIMESTAMP,
          complete_time TIMESTAMP,
          reference_number VARCHAR(255),
          employee_id VARCHAR(255),
          shop_id VARCHAR(255),
          tax_category_id VARCHAR(255),
          discount_percent DECIMAL(10, 2),
          discount_amount DECIMAL(10, 2),
          subtotal DECIMAL(10, 2),
          total DECIMAL(10, 2),
          total_tax DECIMAL(10, 2),
          archived BOOLEAN DEFAULT FALSE,
          voided BOOLEAN DEFAULT FALSE,
          raw_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS purchase_order_lines (
          purchase_order_line_id VARCHAR(255) PRIMARY KEY,
          purchase_order_id VARCHAR(255) NOT NULL,
          item_id VARCHAR(255),
          quantity INTEGER,
          quantity_received INTEGER,
          cost DECIMAL(10, 2),
          time_stamp TIMESTAMP,
          raw_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(purchase_order_id) ON DELETE CASCADE,
          FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE SET NULL
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS returns (
          return_id VARCHAR(255) PRIMARY KEY,
          sale_id VARCHAR(255) NOT NULL,
          sale_number VARCHAR(255),
          create_time TIMESTAMP,
          time_stamp TIMESTAMP,
          update_time TIMESTAMP,
          complete_time TIMESTAMP,
          customer_id VARCHAR(255),
          employee_id VARCHAR(255),
          shop_id VARCHAR(255),
          total DECIMAL(10, 2),
          raw_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS return_lines (
          return_line_id VARCHAR(255) PRIMARY KEY,
          return_id VARCHAR(255) NOT NULL,
          sale_line_id VARCHAR(255),
          item_id VARCHAR(255),
          quantity INTEGER,
          unit_price DECIMAL(10, 2),
          time_stamp TIMESTAMP,
          raw_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (return_id) REFERENCES returns(return_id) ON DELETE CASCADE,
          FOREIGN KEY (sale_line_id) REFERENCES sale_lines(sale_line_id) ON DELETE SET NULL,
          FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE SET NULL
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_metadata (
          id SERIAL PRIMARY KEY,
          sync_type VARCHAR(50) UNIQUE NOT NULL,
          last_sync_time TIMESTAMP,
          last_updated_since TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS product_mapping (
          id SERIAL PRIMARY KEY,
          lightspeed_item_id VARCHAR(255) NOT NULL,
          contpaqi_codigo VARCHAR(255) NOT NULL,
          mapping_type VARCHAR(50) DEFAULT 'manual',
          is_active BOOLEAN DEFAULT TRUE,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (lightspeed_item_id) REFERENCES items(item_id) ON DELETE CASCADE,
          UNIQUE(lightspeed_item_id, contpaqi_codigo)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS contpaqi_sync_logs (
          id SERIAL PRIMARY KEY,
          sync_type VARCHAR(50) NOT NULL,
          lightspeed_item_id VARCHAR(255),
          contpaqi_codigo VARCHAR(255),
          lightspeed_qoh INTEGER,
          contpaqi_existencia INTEGER,
          diferencia INTEGER,
          documento_id VARCHAR(255),
          success BOOLEAN DEFAULT FALSE,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (lightspeed_item_id) REFERENCES items(item_id) ON DELETE SET NULL
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS contpaqi_queue (
          id SERIAL PRIMARY KEY,
          operation_type VARCHAR(50) NOT NULL,
          payload JSONB NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          priority INTEGER DEFAULT 5,
          retry_count INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 5,
          next_retry_at TIMESTAMP,
          error_message TEXT,
          result JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          processed_at TIMESTAMP
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id);
        CREATE INDEX IF NOT EXISTS idx_items_item_matrix_id ON items(item_matrix_id);
        CREATE INDEX IF NOT EXISTS idx_items_time_stamp ON items(time_stamp);
        CREATE INDEX IF NOT EXISTS idx_inventory_item_id ON inventory(item_id);
        CREATE INDEX IF NOT EXISTS idx_sales_time_stamp ON sales(time_stamp);
        CREATE INDEX IF NOT EXISTS idx_sale_lines_sale_id ON sale_lines(sale_id);
        CREATE INDEX IF NOT EXISTS idx_sale_lines_item_id ON sale_lines(item_id);
        CREATE INDEX IF NOT EXISTS idx_product_mapping_lightspeed_item_id ON product_mapping(lightspeed_item_id);
        CREATE INDEX IF NOT EXISTS idx_product_mapping_contpaqi_codigo ON product_mapping(contpaqi_codigo);
        CREATE INDEX IF NOT EXISTS idx_contpaqi_sync_logs_item_id ON contpaqi_sync_logs(lightspeed_item_id);
        CREATE INDEX IF NOT EXISTS idx_contpaqi_sync_logs_created_at ON contpaqi_sync_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_contpaqi_queue_status ON contpaqi_queue(status);
        CREATE INDEX IF NOT EXISTS idx_contpaqi_queue_next_retry ON contpaqi_queue(next_retry_at) WHERE status = 'pending';
        CREATE INDEX IF NOT EXISTS idx_contpaqi_queue_priority ON contpaqi_queue(priority DESC, created_at ASC);
      `);

      await client.query('COMMIT');
      logger.info('Base de datos inicializada correctamente');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error al inicializar la base de datos', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertCategory(category: Category): Promise<void> {
    const query = `
      INSERT INTO categories (
        category_id, name, node_depth, full_path_name, left_node, right_node,
        create_time, time_stamp, raw_data, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (category_id) DO UPDATE SET
        name = EXCLUDED.name,
        node_depth = EXCLUDED.node_depth,
        full_path_name = EXCLUDED.full_path_name,
        left_node = EXCLUDED.left_node,
        right_node = EXCLUDED.right_node,
        time_stamp = EXCLUDED.time_stamp,
        raw_data = EXCLUDED.raw_data,
        updated_at = NOW()
    `;

    await this.pool.query(query, [
      category.categoryID,
      category.name,
      category.nodeDepth ? parseInt(category.nodeDepth, 10) : null,
      category.fullPathName,
      category.leftNode ? parseInt(category.leftNode, 10) : null,
      category.rightNode ? parseInt(category.rightNode, 10) : null,
      category.createTime ? new Date(category.createTime) : null,
      category.timeStamp ? new Date(category.timeStamp) : null,
      JSON.stringify(category),
    ]);
  }

  async upsertItemMatrix(matrix: ItemMatrix): Promise<void> {
    const query = `
      INSERT INTO item_matrices (
        item_matrix_id, description, tax, default_cost, item_type, time_stamp, raw_data, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (item_matrix_id) DO UPDATE SET
        description = EXCLUDED.description,
        tax = EXCLUDED.tax,
        default_cost = EXCLUDED.default_cost,
        item_type = EXCLUDED.item_type,
        time_stamp = EXCLUDED.time_stamp,
        raw_data = EXCLUDED.raw_data,
        updated_at = NOW()
    `;

    await this.pool.query(query, [
      matrix.itemMatrixID,
      matrix.description,
      matrix.tax ? parseFloat(matrix.tax) : null,
      matrix.defaultCost ? parseFloat(matrix.defaultCost) : null,
      matrix.itemType,
      matrix.timeStamp ? new Date(matrix.timeStamp) : null,
      JSON.stringify(matrix),
    ]);
  }

  async upsertItem(item: Item): Promise<void> {
    const query = `
      INSERT INTO items (
        item_id, system_sku, default_cost, avg_cost, discountable, tax, archived,
        item_type, serialized, description, model_year, upc, ean, custom_sku,
        manufacturer_sku, create_time, time_stamp, category_id, item_matrix_id, raw_data, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
      ON CONFLICT (item_id) DO UPDATE SET
        system_sku = EXCLUDED.system_sku,
        default_cost = EXCLUDED.default_cost,
        avg_cost = EXCLUDED.avg_cost,
        discountable = EXCLUDED.discountable,
        tax = EXCLUDED.tax,
        archived = EXCLUDED.archived,
        item_type = EXCLUDED.item_type,
        serialized = EXCLUDED.serialized,
        description = EXCLUDED.description,
        model_year = EXCLUDED.model_year,
        upc = EXCLUDED.upc,
        ean = EXCLUDED.ean,
        custom_sku = EXCLUDED.custom_sku,
        manufacturer_sku = EXCLUDED.manufacturer_sku,
        time_stamp = EXCLUDED.time_stamp,
        category_id = EXCLUDED.category_id,
        item_matrix_id = EXCLUDED.item_matrix_id,
        raw_data = EXCLUDED.raw_data,
        updated_at = NOW()
    `;

    // Manejar category_id: convertir "0" o vacío a null para la base de datos
    let categoryId: string | null = item.categoryID || null;
    if (categoryId === '0' || categoryId === '') {
      categoryId = null;
    }

    // Manejar itemMatrixID: convertir "0" o vacío a null para la base de datos
    let itemMatrixId: string | null = item.itemMatrixID || null;
    if (itemMatrixId === '0' || itemMatrixId === '') {
      itemMatrixId = null;
    }

    await this.pool.query(query, [
      item.itemID,
      item.systemSku,
      item.defaultCost ? parseFloat(item.defaultCost) : null,
      item.avgCost ? parseFloat(item.avgCost) : null,
      item.discountable === 'true' || item.discountable === '1',
      item.tax ? parseFloat(item.tax) : null,
      item.archived === 'true' || item.archived === '1',
      item.itemType,
      item.serialized === 'true' || item.serialized === '1',
      item.description,
      item.modelYear ? parseInt(item.modelYear, 10) : null,
      item.upc,
      item.ean,
      item.customSku,
      item.manufacturerSku,
      item.createTime ? new Date(item.createTime) : null,
      item.timeStamp ? new Date(item.timeStamp) : null,
      categoryId,
      itemMatrixId,
      JSON.stringify(item),
    ]);
  }

  async upsertInventory(inventory: Inventory): Promise<void> {
    const query = `
      INSERT INTO inventory (
        item_id, qoh, qoo, qbo, qs, qsbo, time_stamp, raw_data, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (item_id) DO UPDATE SET
        qoh = EXCLUDED.qoh,
        qoo = EXCLUDED.qoo,
        qbo = EXCLUDED.qbo,
        qs = EXCLUDED.qs,
        qsbo = EXCLUDED.qsbo,
        time_stamp = EXCLUDED.time_stamp,
        raw_data = EXCLUDED.raw_data,
        updated_at = NOW()
    `;

    await this.pool.query(query, [
      inventory.itemID,
      inventory.qoh ? parseInt(inventory.qoh, 10) : 0,
      inventory.qoo ? parseInt(inventory.qoo, 10) : 0,
      inventory.qbo ? parseInt(inventory.qbo, 10) : 0,
      inventory.qs ? parseInt(inventory.qs, 10) : 0,
      inventory.qsbo ? parseInt(inventory.qsbo, 10) : 0,
      inventory.timeStamp ? new Date(inventory.timeStamp) : null,
      JSON.stringify(inventory),
    ]);
  }

  async upsertSale(sale: Sale): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const saleQuery = `
        INSERT INTO sales (
          sale_id, sale_number, create_time, time_stamp, update_time, complete_time,
          reference_number, reference_number_source, tax_category_id, employee_id,
          register_id, shop_id, customer_id, discount_percent, discount_amount,
          subtotal, total, total_due, total_tax, archived, voided, raw_data, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
        ON CONFLICT (sale_id) DO UPDATE SET
          sale_number = EXCLUDED.sale_number,
          time_stamp = EXCLUDED.time_stamp,
          update_time = EXCLUDED.update_time,
          complete_time = EXCLUDED.complete_time,
          reference_number = EXCLUDED.reference_number,
          reference_number_source = EXCLUDED.reference_number_source,
          tax_category_id = EXCLUDED.tax_category_id,
          employee_id = EXCLUDED.employee_id,
          register_id = EXCLUDED.register_id,
          shop_id = EXCLUDED.shop_id,
          customer_id = EXCLUDED.customer_id,
          discount_percent = EXCLUDED.discount_percent,
          discount_amount = EXCLUDED.discount_amount,
          subtotal = EXCLUDED.subtotal,
          total = EXCLUDED.total,
          total_due = EXCLUDED.total_due,
          total_tax = EXCLUDED.total_tax,
          archived = EXCLUDED.archived,
          voided = EXCLUDED.voided,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()
      `;

      // Buscar líneas en SaleLines.SaleLine (formato nuevo) o SaleLine (formato antiguo)
      let saleLines: any[] = [];
      if (sale.SaleLines?.SaleLine) {
        const lines = sale.SaleLines.SaleLine;
        saleLines = Array.isArray(lines) ? lines : [lines];
      } else if (sale.SaleLine) {
        saleLines = Array.isArray(sale.SaleLine) ? sale.SaleLine : [sale.SaleLine];
      }

      await client.query(saleQuery, [
        sale.saleID,
        sale.saleNumber,
        sale.createTime ? new Date(sale.createTime) : null,
        sale.timeStamp ? new Date(sale.timeStamp) : null,
        sale.updateTime ? new Date(sale.updateTime) : null,
        sale.completeTime ? new Date(sale.completeTime) : null,
        sale.referenceNumber,
        sale.referenceNumberSource,
        sale.taxCategoryID,
        sale.employeeID,
        sale.registerID,
        sale.shopID,
        sale.customerID,
        sale.discountPercent ? parseFloat(sale.discountPercent) : null,
        sale.discountAmount ? parseFloat(sale.discountAmount) : null,
        sale.subtotal ? parseFloat(sale.subtotal) : null,
        sale.total ? parseFloat(sale.total) : null,
        sale.totalDue ? parseFloat(sale.totalDue) : null,
        sale.totalTax ? parseFloat(sale.totalTax) : null,
        sale.archived === 'true' || sale.archived === '1',
        sale.voided === 'true' || sale.voided === '1',
        JSON.stringify(sale),
      ]);

      // Eliminar líneas de venta existentes y guardar las nuevas
      await client.query('DELETE FROM sale_lines WHERE sale_id = $1', [sale.saleID]);

      if (saleLines.length > 0) {
        const lineQuery = `
          INSERT INTO sale_lines (
            sale_line_id, sale_id, unit_quantity, unit_price, normal_unit_price,
            discount_amount, item_id, returned, time_stamp, raw_data, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        `;

        for (const line of saleLines) {
          const isReturned = line.returned === 'true' || line.returned === '1' || parseFloat(line.unitQuantity || '0') < 0;
          await client.query(lineQuery, [
            line.saleLineID,
            sale.saleID,
            line.unitQuantity ? parseInt(line.unitQuantity, 10) : null,
            line.unitPrice ? parseFloat(line.unitPrice) : null,
            line.normalUnitPrice ? parseFloat(line.normalUnitPrice) : null,
            line.discountAmount ? parseFloat(line.discountAmount) : null,
            line.itemID,
            isReturned,
            line.timeStamp ? new Date(line.timeStamp) : null,
            JSON.stringify(line),
          ]);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene la última fecha de sincronización para un tipo
   */
  async getLastSyncTime(syncType: string): Promise<string | null> {
    const result = await this.pool.query(
      'SELECT last_updated_since FROM sync_metadata WHERE sync_type = $1',
      [syncType]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].last_updated_since
      ? new Date(result.rows[0].last_updated_since).toISOString()
      : null;
  }

  async updateSyncTime(syncType: string, updatedSince: string | null = null): Promise<void> {
    const query = `
      INSERT INTO sync_metadata (sync_type, last_sync_time, last_updated_since, updated_at)
      VALUES ($1, NOW(), $2, NOW())
      ON CONFLICT (sync_type) DO UPDATE SET
        last_sync_time = NOW(),
        last_updated_since = COALESCE(EXCLUDED.last_updated_since, sync_metadata.last_updated_since),
        updated_at = NOW()
    `;

    await this.pool.query(query, [syncType, updatedSince ? new Date(updatedSince) : null]);
  }

  async getProductMapping(lightspeedItemId: string): Promise<{ contpaqiCodigo: string } | null> {
    const result = await this.pool.query(
      'SELECT contpaqi_codigo FROM product_mapping WHERE lightspeed_item_id = $1 AND is_active = TRUE',
      [lightspeedItemId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return { contpaqiCodigo: result.rows[0].contpaqi_codigo };
  }

  async upsertProductMapping(
    lightspeedItemId: string,
    contpaqiCodigo: string,
    mappingType: string = 'manual',
    notes?: string
  ): Promise<void> {
    const query = `
      INSERT INTO product_mapping (
        lightspeed_item_id, contpaqi_codigo, mapping_type, notes, updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (lightspeed_item_id, contpaqi_codigo) DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        notes = EXCLUDED.notes,
        is_active = TRUE,
        updated_at = NOW()
    `;

    await this.pool.query(query, [lightspeedItemId, contpaqiCodigo, mappingType, notes]);
  }

  async getAllProductMappings(): Promise<Array<{ lightspeedItemId: string; contpaqiCodigo: string }>> {
    const result = await this.pool.query(
      'SELECT lightspeed_item_id, contpaqi_codigo FROM product_mapping WHERE is_active = TRUE'
    );

    return result.rows.map((row) => ({
      lightspeedItemId: row.lightspeed_item_id,
      contpaqiCodigo: row.contpaqi_codigo,
    }));
  }

  async logContpaqiSync(
    syncType: string,
    lightspeedItemId: string | null,
    contpaqiCodigo: string | null,
    lightspeedQoh: number | null,
    contpaqiExistencia: number | null,
    diferencia: number | null,
    documentoId: string | null,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const query = `
      INSERT INTO contpaqi_sync_logs (
        sync_type, lightspeed_item_id, contpaqi_codigo, lightspeed_qoh,
        contpaqi_existencia, diferencia, documento_id, success, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.pool.query(query, [
      syncType,
      lightspeedItemId,
      contpaqiCodigo,
      lightspeedQoh,
      contpaqiExistencia,
      diferencia,
      documentoId,
      success,
      errorMessage,
    ]);
  }

  async getItemsWithMappingAndInventory(): Promise<
    Array<{
      itemId: string;
      systemSku: string;
      contpaqiCodigo: string;
      qoh: number;
    }>
  > {
    const query = `
      SELECT 
        i.item_id,
        i.system_sku,
        pm.contpaqi_codigo,
        inv.qoh
      FROM items i
      INNER JOIN product_mapping pm ON i.item_id = pm.lightspeed_item_id
      INNER JOIN inventory inv ON i.item_id = inv.item_id
      WHERE pm.is_active = TRUE
      ORDER BY i.item_id
    `;

    const result = await this.pool.query(query);
    return result.rows.map((row) => ({
      itemId: row.item_id,
      systemSku: row.system_sku,
      contpaqiCodigo: row.contpaqi_codigo,
      qoh: row.qoh,
    }));
  }

  async query(text: string, params?: any[]): Promise<any> {
    return await this.pool.query(text, params);
  }

  async getItemsWithoutMapping(limit: number = 100): Promise<Array<{
    item_id: string;
    system_sku: string;
    custom_sku: string;
    upc: string;
    ean: string;
  }>> {
    const result = await this.pool.query(`
      SELECT i.item_id, i.system_sku, i.custom_sku, i.upc, i.ean
      FROM items i
      LEFT JOIN product_mapping pm ON i.item_id = pm.lightspeed_item_id AND pm.is_active = TRUE
      WHERE pm.id IS NULL
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  async enqueueContpaqiOperation(
    operationType: 'map_product' | 'sync_inventory' | 'process_document' | 'process_purchase' | 'process_return',
    payload: any,
    priority: number = 5
  ): Promise<number> {
    const query = `
      INSERT INTO contpaqi_queue (operation_type, payload, priority, status, next_retry_at)
      VALUES ($1, $2, $3, 'pending', NOW())
      RETURNING id
    `;
    const result = await this.pool.query(query, [operationType, JSON.stringify(payload), priority]);
    return result.rows[0].id;
  }

  /**
   * Obtiene las siguientes operaciones pendientes de la cola
   */
  async getPendingQueueOperations(limit: number = 10): Promise<Array<{
    id: number;
    operationType: string;
    payload: any;
    retryCount: number;
    maxRetries: number;
  }>> {
    const query = `
      SELECT id, operation_type, payload, retry_count, max_retries
      FROM contpaqi_queue
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= NOW())
      ORDER BY priority DESC, created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `;
    const result = await this.pool.query(query, [limit]);
    return result.rows.map(row => ({
      id: row.id,
      operationType: row.operation_type,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
    }));
  }

  async markQueueOperationCompleted(queueId: number, result?: any): Promise<void> {
    const query = `
      UPDATE contpaqi_queue
      SET status = 'completed',
          result = $1,
          processed_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
    `;
    await this.pool.query(query, [result ? JSON.stringify(result) : null, queueId]);
  }

  async markQueueOperationFailed(queueId: number, errorMessage: string, retryCount: number, maxRetries: number): Promise<void> {
    const shouldRetry = retryCount < maxRetries;
    const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 300000); // Max 5 minutos
    const nextRetryAt = shouldRetry ? new Date(Date.now() + backoffMs) : null;
    const status = shouldRetry ? 'pending' : 'failed';

    const query = `
      UPDATE contpaqi_queue
      SET status = $1,
          retry_count = $2,
          error_message = $3,
          next_retry_at = $4,
          updated_at = NOW()
      WHERE id = $5
    `;
    await this.pool.query(query, [status, retryCount + 1, errorMessage, nextRetryAt, queueId]);
  }

  async getQueueStats(): Promise<{
    pending: number;
    failed: number;
    completed: number;
    total: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) as total
      FROM contpaqi_queue
    `;
    const result = await this.pool.query(query);
    return result.rows[0];
  }

  async updateSyncLogsWithDocumentId(documentoId: string, contpaqiCodigo: string): Promise<void> {
    await this.pool.query(
      `UPDATE contpaqi_sync_logs 
       SET documento_id = $1 
       WHERE contpaqi_codigo = $2 
       AND created_at > NOW() - INTERVAL '1 minute'`,
      [documentoId, contpaqiCodigo]
    );
  }

  async upsertPurchaseOrder(purchaseOrder: PurchaseOrder): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const purchaseOrderQuery = `
        INSERT INTO purchase_orders (
          purchase_order_id, purchase_order_number, vendor_id, create_time, time_stamp, update_time, complete_time,
          reference_number, employee_id, shop_id, tax_category_id, discount_percent, discount_amount,
          subtotal, total, total_tax, archived, voided, raw_data, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
        ON CONFLICT (purchase_order_id) DO UPDATE SET
          purchase_order_number = EXCLUDED.purchase_order_number,
          vendor_id = EXCLUDED.vendor_id,
          time_stamp = EXCLUDED.time_stamp,
          update_time = EXCLUDED.update_time,
          complete_time = EXCLUDED.complete_time,
          reference_number = EXCLUDED.reference_number,
          employee_id = EXCLUDED.employee_id,
          shop_id = EXCLUDED.shop_id,
          tax_category_id = EXCLUDED.tax_category_id,
          discount_percent = EXCLUDED.discount_percent,
          discount_amount = EXCLUDED.discount_amount,
          subtotal = EXCLUDED.subtotal,
          total = EXCLUDED.total,
          total_tax = EXCLUDED.total_tax,
          archived = EXCLUDED.archived,
          voided = EXCLUDED.voided,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()
      `;

      const purchaseOrderLines = Array.isArray(purchaseOrder.PurchaseOrderLine) 
        ? purchaseOrder.PurchaseOrderLine 
        : purchaseOrder.PurchaseOrderLine 
          ? [purchaseOrder.PurchaseOrderLine] 
          : [];

      await client.query(purchaseOrderQuery, [
        purchaseOrder.purchaseOrderID,
        purchaseOrder.purchaseOrderNumber,
        purchaseOrder.vendorID,
        purchaseOrder.createTime ? new Date(purchaseOrder.createTime) : null,
        purchaseOrder.timeStamp ? new Date(purchaseOrder.timeStamp) : null,
        purchaseOrder.updateTime ? new Date(purchaseOrder.updateTime) : null,
        purchaseOrder.completeTime ? new Date(purchaseOrder.completeTime) : null,
        purchaseOrder.referenceNumber,
        purchaseOrder.employeeID,
        purchaseOrder.shopID,
        purchaseOrder.taxCategoryID,
        purchaseOrder.discountPercent ? parseFloat(purchaseOrder.discountPercent) : null,
        purchaseOrder.discountAmount ? parseFloat(purchaseOrder.discountAmount) : null,
        purchaseOrder.subtotal ? parseFloat(purchaseOrder.subtotal) : null,
        purchaseOrder.total ? parseFloat(purchaseOrder.total) : null,
        purchaseOrder.totalTax ? parseFloat(purchaseOrder.totalTax) : null,
        purchaseOrder.archived === 'true' || purchaseOrder.archived === '1',
        purchaseOrder.voided === 'true' || purchaseOrder.voided === '1',
        JSON.stringify(purchaseOrder),
      ]);

      await client.query('DELETE FROM purchase_order_lines WHERE purchase_order_id = $1', [purchaseOrder.purchaseOrderID]);

      if (purchaseOrderLines.length > 0) {
        const lineQuery = `
          INSERT INTO purchase_order_lines (
            purchase_order_line_id, purchase_order_id, item_id, quantity, quantity_received, cost, time_stamp, raw_data, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `;

        for (const line of purchaseOrderLines) {
          if (line.purchaseOrderLineID) {
            await client.query(lineQuery, [
              line.purchaseOrderLineID,
              purchaseOrder.purchaseOrderID,
              line.itemID,
              line.quantity ? parseInt(line.quantity, 10) : null,
              line.quantityReceived ? parseInt(line.quantityReceived, 10) : null,
              line.cost ? parseFloat(line.cost) : null,
              line.timeStamp ? new Date(line.timeStamp) : null,
              JSON.stringify(line),
            ]);
          }
        }
      }

      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.release();
    }
  }

  async upsertReturn(sale: Sale): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const returnQuery = `
        INSERT INTO returns (
          return_id, sale_id, sale_number, create_time, time_stamp, update_time, complete_time,
          customer_id, employee_id, shop_id, total, raw_data, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (return_id) DO UPDATE SET
          sale_number = EXCLUDED.sale_number,
          time_stamp = EXCLUDED.time_stamp,
          update_time = EXCLUDED.update_time,
          complete_time = EXCLUDED.complete_time,
          customer_id = EXCLUDED.customer_id,
          employee_id = EXCLUDED.employee_id,
          shop_id = EXCLUDED.shop_id,
          total = EXCLUDED.total,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()
      `;

      const saleLines = Array.isArray(sale.SaleLine) ? sale.SaleLine : sale.SaleLine ? [sale.SaleLine] : [];
      const returnLines = saleLines.filter(line => 
        line.returned === 'true' || line.returned === '1' || parseFloat(line.unitQuantity || '0') < 0
      );

      await client.query(returnQuery, [
        sale.saleID,
        sale.saleID,
        sale.saleNumber,
        sale.createTime ? new Date(sale.createTime) : null,
        sale.timeStamp ? new Date(sale.timeStamp) : null,
        sale.updateTime ? new Date(sale.updateTime) : null,
        sale.completeTime ? new Date(sale.completeTime) : null,
        sale.customerID,
        sale.employeeID,
        sale.shopID,
        sale.total ? parseFloat(sale.total) : null,
        JSON.stringify(sale),
      ]);

      await client.query('DELETE FROM return_lines WHERE return_id = $1', [sale.saleID]);

      if (returnLines.length > 0) {
        const lineQuery = `
          INSERT INTO return_lines (
            return_line_id, return_id, sale_line_id, item_id, quantity, unit_price, time_stamp, raw_data, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `;

        for (const line of returnLines) {
          if (line.saleLineID) {
            await client.query(lineQuery, [
              line.saleLineID,
              sale.saleID,
              line.saleLineID,
              line.itemID,
              line.unitQuantity ? Math.abs(parseInt(line.unitQuantity, 10)) : null,
              line.unitPrice ? parseFloat(line.unitPrice) : null,
              line.timeStamp ? new Date(line.timeStamp) : null,
              JSON.stringify(line),
            ]);
          }
        }
      }

      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

