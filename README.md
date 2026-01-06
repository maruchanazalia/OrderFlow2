# Lightspeed ↔ CONTPAQi Sync

Sistema de sincronización automatizada entre Lightspeed Retail POS y CONTPAQi Comercial. Sincroniza catálogos, inventario, ventas, devoluciones y compras mediante polling programado cada 3 horas.

## Características

- Sincronización automática de catálogos, inventario, ventas, devoluciones y compras
- Envío directo de documentos a CONTPAQi sin comparación previa
- Sistema de colas persistente con reintentos automáticos
- Manejo robusto de errores y reconexiones automáticas
- Sincronización incremental para optimizar rendimiento
- Base de datos PostgreSQL para persistencia de datos

## Requisitos

- Node.js 18+ 
- PostgreSQL 12+
- Docker (opcional, para base de datos)
- Credenciales de Lightspeed Retail POS API
- Credenciales de CONTPAQi Comercial API (opcional)

## Instalación

```bash
# Clonar repositorio
git clone <repository-url>
cd lightspeed-sync

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Compilar TypeScript
npm run build

# Iniciar aplicación
npm start
```

## Configuración

### Variables de Entorno

Crea un archivo `.env` basado en `.env.example`:

#### Lightspeed (requerido)
```env
LIGHTSPEED_API_URL=https://api.lightspeedapp.com/API/V3
LIGHTSPEED_CLIENT_ID=tu_client_id
LIGHTSPEED_CLIENT_SECRET=tu_client_secret
LIGHTSPEED_REFRESH_TOKEN=tu_refresh_token
LIGHTSPEED_ACCOUNT_ID=tu_account_id
```

#### CONTPAQi (opcional)
```env
CONTAPAQI_API_URL=https://demo.arxsoftware.cloud
CONTAPAQI_USERNAME=tu_usuario
CONTAPAQI_PASSWORD=tu_contraseña
CONTAPAQI_CONCEPTO_ID=3
CONTAPAQI_CLIENTE_DEFAULT=1
CONTAPAQI_AGENTE=Sistema de Sincronización
```

#### Base de Datos
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=lightspeed_sync
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
```

## Base de Datos

### Opción 1: Docker (Recomendado)

```bash
# Iniciar base de datos
docker-compose up -d

# Detener base de datos
docker-compose down

# Reiniciar base de datos
docker-compose restart
```

### Opción 2: PostgreSQL Manual

Crea una base de datos PostgreSQL y configura las variables de entorno correspondientes.

## Uso

### Iniciar la aplicación

```bash
npm start
```

La aplicación iniciará automáticamente:
- Conexión a PostgreSQL
- Autenticación con Lightspeed y CONTPAQi
- Sincronización inicial de datos
- Scheduler programado (cada 3 horas)
- Procesador de cola CONTPAQi (cada 5 segundos)

### Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Ejecutar en modo desarrollo con ts-node
npm run watch        # Compilar TypeScript en modo watch

# Base de datos
npm run db:start     # Iniciar PostgreSQL con Docker
npm run db:stop      # Detener PostgreSQL
npm run db:restart   # Reiniciar PostgreSQL

# Utilidades
npm run stats        # Ver estadísticas de la base de datos

# Tests
npm test             # Ejecutar todos los tests
npm run test:watch   # Ejecutar tests en modo watch
npm run test:coverage # Ejecutar tests con cobertura
```

## Estructura del Proyecto

```
lightspeed-sync/
├── src/
│   ├── config/          # Autenticación y configuración
│   │   ├── auth.ts      # Autenticación OAuth2 Lightspeed
│   │   ├── contpaqiAuth.ts # Autenticación JWT CONTPAQi
│   │   └── logger.ts    # Sistema de logging
│   ├── services/        # Servicios de API
│   │   ├── base.ts      # Clase base para servicios Lightspeed
│   │   ├── catalog.ts   # Catálogos (Category, ItemMatrix, Item)
│   │   ├── inventory.ts # Inventario
│   │   ├── sales.ts     # Ventas y devoluciones
│   │   ├── purchases.ts # Órdenes de compra
│   │   ├── contpaqiProducts.ts # Productos CONTPAQi
│   │   └── contpaqiDocuments.ts # Documentos CONTPAQi
│   ├── jobs/            # Scheduler y procesador de cola
│   │   ├── scheduler.ts # Sincronización programada
│   │   └── queueProcessor.ts # Procesador de cola CONTPAQi
│   └── db/              # Modelos de base de datos
│       └── models.ts    # Operaciones de base de datos
├── tests/               # Suite de tests
├── logs/                # Archivos de log
├── docker-compose.yml   # Configuración Docker PostgreSQL
└── package.json         # Dependencias y scripts
```

## Flujo de Sincronización

1. **Catálogos**: Sincroniza Category, ItemMatrix, Item desde Lightspeed
2. **Mapeo**: Intenta mapear productos automáticamente con CONTPAQi (no crítico si falla)
3. **Inventario**: Sincroniza inventario de Lightspeed
4. **Ventas**: Sincroniza ventas normales y las envía a CONTPAQi como documentos
5. **Devoluciones**: Detecta y sincroniza devoluciones, las envía a CONTPAQi
6. **Compras**: Sincroniza órdenes de compra y las envía a CONTPAQi

## Sistema de Colas

Las operaciones de CONTPAQi se procesan en una cola persistente:
- Procesamiento asíncrono cada 5 segundos
- Reintentos automáticos con backoff exponencial
- Manejo de errores de conexión sin pérdida de datos
- Persistencia en PostgreSQL

## Logs

Los logs se guardan en:
- `logs/combined.log` - Todos los logs
- `logs/error.log` - Solo errores

Los logs incluyen información detallada sobre:
- Sincronizaciones realizadas
- Operaciones de cola procesadas
- Errores y advertencias
- Estadísticas de rendimiento

## Tests

El proyecto incluye una suite completa de tests:

```bash
npm test
```

Los tests cubren:
- Detección de devoluciones
- Manejo de errores
- Paginación
- Operaciones de base de datos
- Procesamiento de cola
- Utilidades y helpers

## Troubleshooting

### Error de conexión a la base de datos
- Verifica que PostgreSQL esté corriendo
- Revisa las credenciales en `.env`
- Si usas Docker, ejecuta `docker-compose up -d`

### Error de autenticación Lightspeed
- Verifica que el refresh token sea válido
- Revisa las credenciales OAuth2 en `.env`

### Documentos no se procesan
- Verifica que CONTPAQi esté configurado en `.env`
- Revisa los logs en `logs/error.log`
- Verifica el estado de la cola con `npm run stats`

## Licencia

[Tu licencia aquí]

## Soporte

Para problemas o preguntas, abre un issue en el repositorio.
