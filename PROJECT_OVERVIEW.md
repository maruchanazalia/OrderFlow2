# OrderFlow2 - Resumen del Proyecto

## 1. Propósito general

Aplicación de sincronización bidireccional Lightspeed Retail ↔ CONTPAQi Comercial.
- Toma datos de Lightspeed (catálogos, inventario, ventas, devoluciones, compras).
- Normaliza y persiste en una base de datos PostgreSQL.
- Envía documentos a la API CONTPAQi usando cola persistente y reintentos.

## 2. Cómo correr el proyecto

1. Clonar y entrar al proyecto:
   ```bash
   git clone <repo>
   cd OrderFlow2
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno (copia `env.example` en `.env`):
   - `LIGHTSPEED_*`: credenciales de Lightspeed
   - `CONTAPAQI_API_URL`: `http://localhost:88/` (ajustado según requerimiento)
   - `CONTAPAQI_USERNAME`: `USUARIO`
   - `CONTAPAQI_PASSWORD`: `12345`

4. Compilar TypeScript (opcional en desarrollo):
   ```bash
   npm run build
   ```

5. Iniciar servicio:
   ```bash
   npm start
   ```

6. Ejecutar tests:
   ```bash
   npm test
   ```

## 3. Estructura de carpetas y responsabilidades

### `src/`
- `index.ts`: punto de arranque. Crea `SyncScheduler`, inicializa DB, arranca scheduler y maneja señales SIGINT/SIGTERM.

#### `src/config/`
- `auth.ts`: autenticación OAuth2 contra Lightspeed.
- `contpaqiAuth.ts`: inicializa Axios con base URL y credenciales CONTPAQi.
- `logger.ts`: config de Winston para logging (console/archivo).

#### `src/services/`
- `base.ts`: clase base para llamadas a Lightspeed con paginación, rate limiting, reintentos.
- `catalog.ts`, `inventory.ts`, `sales.ts`, `purchases.ts`: consulta/transformación de recursos Lightspeed.
- `contpaqiProducts.ts`: consulta de producto CONTPAQi (mapear productos e inventario).
- `contpaqiDocuments.ts`: envío de documentos a endpoint CONTPAQi, normalización de payload.

#### `src/jobs/`
- `scheduler.ts`: orquesta el flujo completo de sincronización (catálogos, inventory, sales, returns, purchase orders) periódicamente (cron por ENV).
- `queueProcessor.ts`: procesa la cola `contpaqi_queue` con batch de 5 (cada 5s), ejecutando operaciones `map_product`, `process_document`, `process_purchase`, `process_return`.

#### `src/db/`
- `models.ts`: acceso a DB (PostgreSQL) y operaciones CRUD de sincronización, queue y mappings.

### `tests/` (suite de pruebas)
- `services/`, `jobs/`, `config/`, `db/`, `integration/`.
- Contiene casos para lógica de fecha, errores, rutas de sincronización y funcionalidad de cola.

## 4. Flujo principal (cron + cola)

1. `SyncScheduler.start()` ejecuta un sync inmediato + cron programado (`POLLING_CRON_EXPRESSION` predeterminado `0 */3 * * *`).
2. En `runSync()`:
   - `syncCatalogs()` (cargas iniciales/incrementales).
   - `mapProductsWithContpaqi()` (queue `map_product` para productos sin mapeo).
   - `syncInventory()`.
   - `syncSales()` + `processSalesToContpaqi()` (genera documentos CONTPAQi en tabla contpaqi_queue).
   - `syncReturns()` + `processReturnToContpaqi()`.
   - `syncPurchaseOrders()` + `processPurchaseOrderToContpaqi()`.
3. `ContpaqiQueueProcessor.start()` lanza `processQueue()` cada 5s.
4. `processQueue()` lee `getPendingQueueOperations(BATCH_SIZE)`.
5. Para cada operación:
   - `map_product`: mapea SKU a CONTPAQi y actualiza DB.
   - `process_document`/`process_purchase`/`process_return`: pasa por `processDocument()`.
6. `processDocument()` valida movimientos y año en `Fecha`:
   - si año < 2026, omite con `skipped`.
   - si año >= 2026, llama a `ContpaqiDocumentsService.procesarDocumento()`.
7. `ContpaqiDocumentsService.procesarDocumento()`:
   - normaliza `Cliente`, `Coordenadas`, y `Movimientos[].Almacen`.
   - endpoint actualizado: `/api/Documento/ProcesarDocumentoBike`.
   - maneja respuesta y errores con logs.

## 5. Comportamiento concurrente / asíncrono

- La app usa `async/await` en todos los servicios y jobs.
- `Scheduler.runSync()` es secuencial en su alto nivel, pero dentro de loops (por venta, producto, etc.) hace llamadas asíncronas con `await`.
- `QueueProcessor` procesa un batch de operaciones en paralelo con `Promise.allSettled(promises)`.
- Llamadas HTTP (Lightspeed/CONTPAQi) se hacen con Axios asíncrono.

## 6. Reglas importantes y validaciones añadidas

- Endpoint CONTPAQi actualizado a: `ContpaqiDocumentsService` usa `/api/Documento/ProcesarDocumentoBike`.
- Documentos con `fecha < 2026` son ignorados para envío a CONTPAQi (log `Documento omitido...`).
- `.env` y `env.example` configurados:
  - `CONTAPAQI_API_URL=http://localhost:88/`
  - `CONTAPAQI_USERNAME=USUARIO`
  - `CONTAPAQI_PASSWORD=12345`

## 7. Archivos clave y descripción rápida

- `.env`, `env.example`: configuración de credenciales y entornos.
- `tsconfig.json`: compilación TypeScript.
- `package.json`: scripts y dependencias (axios, jest, winston, pg, cron, etc.).
- `docker-compose.yml`: PostgreSQL local.
- `src/index.ts`: arranque y shutdown.
- `src/config/*`: setup de autenticaciones y logger.
- `src/jobs/scheduler.ts`: flujo sincronización Lightspeed → DB → cola.
- `src/jobs/queueProcessor.ts`: flush de cola CONTPAQi.
- `src/services/*`: API wrappers y transformación de datos.
- `src/db/models.ts`: query layer DB, persistencia.

## 8. Validación y pruebas realizadas

- `npm test --silent -- tests/services/contpaqiDocuments.test.ts tests/jobs/queueProcessor.test.ts` ✅
- Todo verde (17 tests pasados).
- La integración completa con `tests/jobs/scheduler.test.ts` depende de mocks de DB externos y puede requerir ajustes locales.

## 9. Tips rápidos para debugging

- Si tienes errores de año en documento, verifica que `Fecha` sea ISO y con año >= 2026.
- Si los documentos no llegan a CONTPAQi, revisa logs en `logs/error.log` y la tabla `contpaqi_queue`.
- En `CONTAPAQI_API_URL`, si hay host docker, ya está configurado a localhost:88 según solicitud.

---

Este documento se creó para reflejar el estado actual del código con los últimos cambios solicitados, y para ayudarte a entender cómo correr y mantener la app.
