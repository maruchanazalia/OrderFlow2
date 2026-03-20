import { SyncScheduler } from './jobs/scheduler';
import { logger } from './config/logger';

// Desactivar validación de certificados SSL en desarrollo/docker
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'docker') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

async function main() {
  logger.info('Iniciando aplicación Lightspeed Sync...');

  const scheduler = new SyncScheduler();

  const shutdown = async (signal: string) => {
    logger.info(`Recibida señal ${signal}, cerrando aplicación...`);
    await scheduler.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await scheduler.initializeDatabase();
    scheduler.start();

    logger.info('Aplicación iniciada correctamente. Presiona Ctrl+C para detener.');
  } catch (error: any) {
    logger.error('Error al iniciar la aplicación', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Error fatal', error);
  process.exit(1);
});

