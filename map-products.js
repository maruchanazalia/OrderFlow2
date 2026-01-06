const { Pool } = require('pg');
const readline = require('readline');
const axios = require('axios');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'lightspeed_sync',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Función para hacer pregunta y obtener respuesta
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Función para autenticar con CONTPAQi
async function getContpaqiToken() {
  const username = process.env.CONTAPAQI_USERNAME;
  const password = process.env.CONTAPAQI_PASSWORD;
  const baseUrl = process.env.CONTAPAQI_BASE_URL || 'https://demo.arxsoftware.cloud';

  try {
    const response = await axios.post(`${baseUrl}/api/login/authenticate`, {
      username,
      password,
    });

    if (typeof response.data === 'string') {
      return response.data;
    } else if (response.data.token) {
      return response.data.token;
    } else if (response.data.data && response.data.data.token) {
      return response.data.data.token;
    }
    throw new Error('Token no encontrado en la respuesta');
  } catch (error) {
    console.error('❌ Error al autenticar con CONTPAQi:', error.message);
    throw error;
  }
}

// Función para buscar producto en CONTPAQi
async function searchContpaqiProduct(token, codigo) {
  const baseUrl = process.env.CONTAPAQI_BASE_URL || 'https://demo.arxsoftware.cloud';
  
  try {
    const response = await axios.get(`${baseUrl}/api/productos/${codigo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

// Función para obtener productos sin mapeo
async function getUnmappedProducts(limit = 10) {
  const query = `
    SELECT DISTINCT
      i.item_id,
      i.system_sku,
      i.description,
      i.upc,
      i.ean,
      inv.qoh
    FROM items i
    LEFT JOIN product_mapping pm ON i.item_id = pm.lightspeed_item_id AND pm.is_active = TRUE
    LEFT JOIN inventory inv ON i.item_id = inv.item_id
    WHERE pm.lightspeed_item_id IS NULL
    ORDER BY i.item_id
    LIMIT $1
  `;
  
  const result = await pool.query(query, [limit]);
  return result.rows;
}

// Función para guardar mapeo
async function saveMapping(itemId, contpaqiCodigo, method = 'manual') {
  const query = `
    INSERT INTO product_mapping (lightspeed_item_id, contpaqi_codigo, mapping_method, notes, is_active)
    VALUES ($1, $2, $3, $4, TRUE)
    ON CONFLICT (lightspeed_item_id) 
    DO UPDATE SET 
      contpaqi_codigo = EXCLUDED.contpaqi_codigo,
      mapping_method = EXCLUDED.mapping_method,
      notes = EXCLUDED.notes,
      is_active = TRUE,
      updated_at = NOW()
  `;
  
  await pool.query(query, [itemId, contpaqiCodigo, method, `Mapeo ${method} realizado el ${new Date().toISOString()}`]);
}

async function main() {
  console.log('🔗 Mapeador de Productos Lightspeed → CONTPAQi\n');
  
  try {
    // Obtener token de CONTPAQi
    console.log('🔐 Autenticando con CONTPAQi...');
    const token = await getContpaqiToken();
    console.log('✅ Autenticación exitosa\n');

    let continueMapping = true;
    let mappedCount = 0;

    while (continueMapping) {
      // Obtener productos sin mapeo
      const unmapped = await getUnmappedProducts(5);
      
      if (unmapped.length === 0) {
        console.log('✅ ¡Todos los productos están mapeados!');
        break;
      }

      console.log(`\n📦 Productos sin mapeo (mostrando ${unmapped.length}):\n`);
      
      unmapped.forEach((product, index) => {
        console.log(`${index + 1}. Item ID: ${product.item_id}`);
        console.log(`   SKU: ${product.system_sku || 'N/A'}`);
        console.log(`   Descripción: ${product.description || 'N/A'}`);
        console.log(`   UPC: ${product.upc || 'N/A'}`);
        console.log(`   EAN: ${product.ean || 'N/A'}`);
        console.log(`   Inventario: ${product.qoh || 0}`);
        console.log('');
      });

      const choice = await question('Selecciona un número (1-5) para mapear, o "s" para saltar este lote: ');
      
      if (choice.toLowerCase() === 's') {
        continueMapping = false;
        break;
      }

      const selectedIndex = parseInt(choice) - 1;
      if (selectedIndex < 0 || selectedIndex >= unmapped.length) {
        console.log('❌ Selección inválida\n');
        continue;
      }

      const selectedProduct = unmapped[selectedIndex];
      
      console.log(`\n🔍 Mapeando: ${selectedProduct.description || selectedProduct.system_sku}`);
      console.log(`   SKU: ${selectedProduct.system_sku || 'N/A'}`);
      console.log(`   UPC: ${selectedProduct.upc || 'N/A'}`);
      console.log(`   EAN: ${selectedProduct.ean || 'N/A'}\n`);

      // Intentar buscar automáticamente con SKU/UPC/EAN
      let contpaqiCodigo = null;
      const codesToTry = [
        selectedProduct.system_sku,
        selectedProduct.upc,
        selectedProduct.ean,
      ].filter(Boolean);

      if (codesToTry.length > 0) {
        console.log('🔎 Buscando en CONTPAQi...');
        for (const code of codesToTry) {
          try {
            const result = await searchContpaqiProduct(token, code);
            if (result && result.CodigoProducto) {
              contpaqiCodigo = result.CodigoProducto;
              console.log(`✅ Producto encontrado en CONTPAQi: ${contpaqiCodigo}`);
              console.log(`   Nombre: ${result.NombreProducto || 'N/A'}`);
              break;
            }
          } catch (error) {
            // Continuar con el siguiente código
          }
        }
      }

      // Si no se encontró, pedir código manualmente
      if (!contpaqiCodigo) {
        console.log('❌ No se encontró automáticamente en CONTPAQi');
        const manualCode = await question('Ingresa el código de CONTPAQi (o "s" para saltar): ');
        
        if (manualCode.toLowerCase() === 's') {
          console.log('⏭️  Saltando este producto\n');
          continue;
        }

        // Verificar que existe en CONTPAQi
        try {
          const result = await searchContpaqiProduct(token, manualCode);
          if (result && result.CodigoProducto) {
            contpaqiCodigo = result.CodigoProducto;
            console.log(`✅ Producto verificado en CONTPAQi: ${result.NombreProducto || 'N/A'}`);
          } else {
            console.log('⚠️  Advertencia: El código no se encontró en CONTPAQi');
            const confirm = await question('¿Deseas guardarlo de todas formas? (s/n): ');
            if (confirm.toLowerCase() !== 's') {
              console.log('⏭️  Saltando este producto\n');
              continue;
            }
            contpaqiCodigo = manualCode;
          }
        } catch (error) {
          console.log('⚠️  Error al verificar en CONTPAQi:', error.message);
          const confirm = await question('¿Deseas guardarlo de todas formas? (s/n): ');
          if (confirm.toLowerCase() !== 's') {
            console.log('⏭️  Saltando este producto\n');
            continue;
          }
          contpaqiCodigo = manualCode;
        }
      }

      // Guardar mapeo
      await saveMapping(selectedProduct.item_id, contpaqiCodigo, contpaqiCodigo ? 'auto' : 'manual');
      mappedCount++;
      console.log(`✅ Mapeo guardado: ${selectedProduct.item_id} → ${contpaqiCodigo}\n`);

      // Preguntar si continuar
      const continueChoice = await question('¿Continuar mapeando? (s/n): ');
      if (continueChoice.toLowerCase() !== 's') {
        continueMapping = false;
      }
    }

    console.log(`\n✅ Mapeo completado. Total mapeados en esta sesión: ${mappedCount}`);
    
    // Mostrar estadísticas finales
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_active = TRUE) as mapeados,
        COUNT(*) FILTER (WHERE is_active = FALSE) as desactivados
      FROM product_mapping
    `);
    
    console.log(`\n📊 Estadísticas:`);
    console.log(`   Productos mapeados activos: ${stats.rows[0].mapeados}`);
    console.log(`   Productos mapeados desactivados: ${stats.rows[0].desactivados}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    rl.close();
    await pool.end();
  }
}

main();

