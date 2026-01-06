const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'lightspeed_sync',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
});

async function getStats() {
  try {
    console.log('📊 Estadísticas de la Base de Datos\n');

    // Total de productos (items)
    const itemsResult = await pool.query('SELECT COUNT(*) as total FROM items');
    const totalItems = parseInt(itemsResult.rows[0].total);
    console.log(`📦 Productos (Items): ${totalItems}`);

    // Total de ventas
    const salesResult = await pool.query('SELECT COUNT(*) as total FROM sales');
    const totalSales = parseInt(salesResult.rows[0].total);
    console.log(`💰 Ventas: ${totalSales}`);

    // Total de devoluciones
    const returnsResult = await pool.query('SELECT COUNT(*) as total FROM returns');
    const totalReturns = parseInt(returnsResult.rows[0].total);
    console.log(`↩️  Devoluciones: ${totalReturns}`);

    // Total de órdenes de compra
    const purchaseOrdersResult = await pool.query('SELECT COUNT(*) as total FROM purchase_orders');
    const totalPurchaseOrders = parseInt(purchaseOrdersResult.rows[0].total);
    console.log(`📦 Órdenes de compra: ${totalPurchaseOrders}`);

    // Productos con mapeo CONTPAQi
    const mappedResult = await pool.query(`
      SELECT COUNT(DISTINCT lightspeed_item_id) as total 
      FROM product_mapping 
      WHERE is_active = TRUE
    `);
    const totalMapped = parseInt(mappedResult.rows[0].total);
    console.log(`🔗 Productos mapeados con CONTPAQi: ${totalMapped}`);

    // Productos sin mapeo
    const unmappedResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM items i
      LEFT JOIN product_mapping pm ON i.item_id = pm.lightspeed_item_id AND pm.is_active = TRUE
      WHERE pm.id IS NULL
    `);
    const totalUnmapped = parseInt(unmappedResult.rows[0].total);
    console.log(`❌ Productos sin mapeo: ${totalUnmapped}`);

    // Inventario sincronizado
    const inventoryResult = await pool.query('SELECT COUNT(*) as total FROM inventory');
    const totalInventory = parseInt(inventoryResult.rows[0].total);
    console.log(`📊 Registros de inventario: ${totalInventory}`);

    // Ventas con líneas
    const saleLinesResult = await pool.query('SELECT COUNT(*) as total FROM sale_lines');
    const totalSaleLines = parseInt(saleLinesResult.rows[0].total);
    console.log(`🛒 Líneas de venta: ${totalSaleLines}`);

    // Líneas de devolución
    const returnLinesResult = await pool.query('SELECT COUNT(*) as total FROM return_lines');
    const totalReturnLines = parseInt(returnLinesResult.rows[0].total);
    console.log(`↩️  Líneas de devolución: ${totalReturnLines}`);

    // Líneas de compra
    const purchaseOrderLinesResult = await pool.query('SELECT COUNT(*) as total FROM purchase_order_lines');
    const totalPurchaseOrderLines = parseInt(purchaseOrderLinesResult.rows[0].total);
    console.log(`📦 Líneas de compra: ${totalPurchaseOrderLines}`);

    // Operaciones en cola CONTPAQi
    const queueStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM contpaqi_queue
    `);
    const queue = queueStats.rows[0];
    console.log(`\n📋 Cola CONTPAQi:`);
    console.log(`   Pendientes: ${queue.pending}`);
    console.log(`   Completadas: ${queue.completed}`);
    console.log(`   Fallidas: ${queue.failed}`);
    console.log(`   Total: ${queue.total}`);

    // Logs de sincronización CONTPAQi
    const syncLogsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE success = TRUE) as success,
        COUNT(*) FILTER (WHERE success = FALSE) as failed,
        COUNT(*) as total
      FROM contpaqi_sync_logs
    `);
    const logs = syncLogsResult.rows[0];
    console.log(`\n📝 Logs de sincronización CONTPAQi:`);
    console.log(`   Exitosos: ${logs.success}`);
    console.log(`   Fallidos: ${logs.failed}`);
    console.log(`   Total: ${logs.total}`);

    // Top 10 productos más vendidos (si hay líneas de venta)
    if (totalSaleLines > 0) {
      console.log(`\n🏆 Top 10 productos más vendidos:`);
      const topProducts = await pool.query(`
        SELECT 
          i.item_id,
          i.system_sku,
          i.description,
          COUNT(sl.sale_line_id) as ventas_count,
          SUM(sl.unit_quantity) as unidades_vendidas
        FROM items i
        INNER JOIN sale_lines sl ON i.item_id = sl.item_id
        GROUP BY i.item_id, i.system_sku, i.description
        ORDER BY ventas_count DESC
        LIMIT 10
      `);
      
      if (topProducts.rows.length > 0) {
        topProducts.rows.forEach((row, index) => {
          console.log(`   ${index + 1}. ${row.system_sku || row.item_id} - ${row.description || 'Sin descripción'} (${row.ventas_count} ventas, ${row.unidades_vendidas} unidades)`);
        });
      }
    } else {
      console.log(`\n⚠️  No hay líneas de venta registradas (las ventas pueden no tener detalles)`);
    }

    // Productos mapeados con detalles
    if (totalMapped > 0) {
      console.log(`\n🔗 Detalles de productos mapeados:`);
      const mappedDetails = await pool.query(`
        SELECT 
          i.item_id,
          i.system_sku,
          i.description,
          pm.contpaqi_codigo,
          pm.mapping_type,
          inv.qoh as inventario_lightspeed
        FROM product_mapping pm
        INNER JOIN items i ON pm.lightspeed_item_id = i.item_id
        LEFT JOIN inventory inv ON i.item_id = inv.item_id
        WHERE pm.is_active = TRUE
        ORDER BY pm.created_at DESC
        LIMIT 10
      `);
      
      mappedDetails.rows.forEach((row, index) => {
        console.log(`   ${index + 1}. Lightspeed: ${row.system_sku || row.item_id} → CONTPAQi: ${row.contpaqi_codigo} (${row.mapping_type})`);
        if (row.inventario_lightspeed !== null) {
          console.log(`      Inventario: ${row.inventario_lightspeed}`);
        }
      });
    } else {
      console.log(`\n⚠️  No hay productos mapeados aún`);
      console.log(`   Hay ${totalUnmapped} productos sin mapeo`);
      console.log(`   Hay ${queue.pending} operaciones pendientes en la cola para mapear`);
    }

    // Resumen de coincidencias
    console.log(`\n📈 Resumen:`);
    console.log(`   Productos totales: ${totalItems}`);
    console.log(`   Productos mapeados: ${totalMapped} (${totalMapped > 0 ? ((totalMapped/totalItems)*100).toFixed(1) : 0}%)`);
    console.log(`   Productos sin mapeo: ${totalUnmapped} (${totalUnmapped > 0 ? ((totalUnmapped/totalItems)*100).toFixed(1) : 0}%)`);
    console.log(`   Ventas totales: ${totalSales}`);
    console.log(`   Devoluciones: ${totalReturns}`);
    console.log(`   Órdenes de compra: ${totalPurchaseOrders}`);
    console.log(`   Líneas de venta: ${totalSaleLines}`);
    console.log(`   Líneas de devolución: ${totalReturnLines}`);
    console.log(`   Líneas de compra: ${totalPurchaseOrderLines}`);

    console.log('\n✅ Estadísticas completadas\n');

  } catch (error) {
    console.error('❌ Error al obtener estadísticas:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   No se pudo conectar a PostgreSQL. Verifica que esté corriendo.');
    }
  } finally {
    await pool.end();
  }
}

getStats();

