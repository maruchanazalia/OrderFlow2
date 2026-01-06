# Tests del Sistema Lightspeed Sync

Este directorio contiene todos los tests del sistema de sincronización.

## ✅ Estado Actual

**Todos los tests están pasando:**
- ✅ 14 suites de tests pasando
- ✅ 110 tests pasando
- ✅ 0 tests fallando

## Estructura

```
tests/
├── setup.ts                    # Configuración inicial de tests
├── config/                     # Tests de configuración
│   ├── auth.test.ts           # Tests de autenticación Lightspeed
│   └── contpaqiAuth.test.ts   # Tests de autenticación CONTPAQi
├── services/                   # Tests de servicios
│   ├── sales.test.ts          # Tests de ventas y devoluciones
│   ├── purchases.test.ts      # Tests de compras
│   ├── catalog.test.ts        # Tests de catálogos
│   ├── inventory.test.ts       # Tests de inventario
│   ├── base.test.ts           # Tests del servicio base
│   ├── contpaqiProducts.test.ts # Tests de productos CONTPAQi
│   └── contpaqiDocuments.test.ts # Tests de documentos CONTPAQi
├── db/                        # Tests de base de datos
│   └── models.test.ts         # Tests de modelos DB
├── jobs/                      # Tests de jobs
│   ├── scheduler.test.ts      # Tests del scheduler
│   └── queueProcessor.test.ts # Tests del procesador de cola
├── integration/               # Tests de integración
│   └── sync-flow.test.ts     # Tests del flujo completo
└── utils/                     # Tests de utilidades
    └── helpers.test.ts        # Tests de funciones helper
```

## Ejecutar Tests

```bash
# Ejecutar todos los tests
npm test

# Ejecutar tests en modo watch
npm run test:watch

# Ejecutar tests con cobertura
npm run test:coverage
```

## Cobertura de Tests

Los tests cubren:

### Autenticación
- ✅ OAuth2 de Lightspeed (obtener y refrescar tokens)
- ✅ JWT de CONTPAQi (autenticación y renovación)
- ✅ Manejo de errores de autenticación (401, 500, etc.)

### Servicios
- ✅ Detección de devoluciones (`isReturn`)
- ✅ Filtrado de ventas y devoluciones
- ✅ Manejo de errores en endpoints no disponibles (404)
- ✅ Paginación en servicios base (múltiples páginas)
- ✅ Rate limiting y exponential backoff
- ✅ Sincronización de catálogos (Category, ItemMatrix, Item)
- ✅ Sincronización de inventario
- ✅ Sincronización de ventas y compras

### Base de Datos
- ✅ Operaciones CRUD (upsert)
- ✅ Mapeo de productos
- ✅ Cola de operaciones CONTPAQi
- ✅ Estadísticas de cola
- ✅ Logs de sincronización

### Jobs
- ✅ Scheduler completo (flujo de sincronización)
- ✅ Procesador de cola (operaciones asíncronas)
- ✅ Manejo de errores sin detener el proceso
- ✅ Prevención de ejecuciones concurrentes

### Utilidades
- ✅ Formateo de fechas
- ✅ Manejo de arrays y objetos
- ✅ Conversión de tipos (boolean, number, string)
- ✅ Parsing de valores null/undefined

## Notas

- Los tests usan mocks para evitar llamadas reales a APIs
- Los tests de base de datos usan mocks de `pg`
- Los tests de integración verifican el flujo completo sin llamadas reales
- Los mocks de axios están configurados para simular respuestas reales
- Los tests cubren casos de éxito y de error

## Mejoras Implementadas

1. **Tests de autenticación mejorados**: Ahora mockean correctamente `axios.post` directamente
2. **Tests de servicios corregidos**: Verifican el uso correcto de `axiosInstance`
3. **Tests de cola mejorados**: Incluyen `getQueueStats` y verifican `processingInterval`
4. **Tests de helpers corregidos**: Usan funciones reales en lugar de comparaciones literales
5. **Tests de productos CONTPAQi**: Verifican null checks correctamente

