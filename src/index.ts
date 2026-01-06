import { SyncScheduler } from './jobs/scheduler';
import { logger } from './config/logger';

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

