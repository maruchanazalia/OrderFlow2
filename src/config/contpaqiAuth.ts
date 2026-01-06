import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';
import { logger } from './logger';

dotenv.config();

interface LoginResponse {
  token?: string;
  access_token?: string;
  jwt?: string;
  success?: boolean;
  message?: string;
  [key: string]: any;
}

export class ContpaqiAuth {
  private apiUrl: string;
  private username: string;
  private password: string;
  private jwtToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.apiUrl = process.env.CONTAPAQI_API_URL || '';
    this.username = process.env.CONTAPAQI_USERNAME || '';
    this.password = process.env.CONTAPAQI_PASSWORD || '';

    // Verificar si las credenciales son valores de ejemplo
    const isExampleCredentials = 
      !this.apiUrl || 
      !this.username || 
      !this.password ||
      this.username === 'your_username' ||
      this.password === 'your_password';

    if (isExampleCredentials) {
      throw new Error('CONTPAQi no configurado: faltan credenciales o son valores de ejemplo');
    }

    let baseUrl = this.apiUrl;
    if (baseUrl.includes('/api/login/authenticate')) {
      baseUrl = baseUrl.replace(/\/api\/login\/authenticate.*$/i, '');
    } else if (baseUrl.includes('/api/login')) {
      baseUrl = baseUrl.replace(/\/api\/login.*$/i, '');
    }
    
    logger.debug('CONTPAQi configurado', {
      apiUrl: this.apiUrl,
      baseUrl: baseUrl,
      username: this.username,
    });
    
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.axiosInstance.interceptors.request.use(async (config) => {
      const token = await this.getJwtToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          if (error.config?.url?.includes('/login/authenticate') || error.config?.url?.includes('/api/login')) {
            return Promise.reject(error);
          }
          
          if (!error.config._retry) {
            error.config._retry = true;
            logger.warn('Token CONTPAQi expirado o inválido, refrescando...');
            this.jwtToken = null;
            this.tokenExpiresAt = 0;
            try {
              const token = await this.getJwtToken();
              if (token && error.config) {
                error.config.headers.Authorization = `Bearer ${token}`;
                return this.axiosInstance.request(error.config);
              }
            } catch (authError) {
              logger.error('Error al refrescar token CONTPAQi, no se reintentará la petición');
              return Promise.reject(authError);
            }
          }
        }
        return Promise.reject(error);
      }
    );
  }

  async getJwtToken(): Promise<string> {
    if (this.jwtToken && Date.now() < this.tokenExpiresAt) {
      return this.jwtToken;
    }
    await this.authenticate();
    return this.jwtToken!;
  }

  private async authenticate(): Promise<void> {
    try {
      let loginEndpoint: string;
      if (this.apiUrl.includes('/api/login/authenticate')) {
        loginEndpoint = this.apiUrl;
      } else if (this.apiUrl.includes('/api/login')) {
        loginEndpoint = `${this.apiUrl}/authenticate`;
      } else {
        loginEndpoint = `${this.apiUrl}/api/login/authenticate`;
      }

      logger.info('Autenticando con CONTPAQi...', {
        endpoint: loginEndpoint,
        username: this.username,
      });

      const requestBody = {
        Username: this.username,
        Password: this.password,
      };

      const response = await axios.post<LoginResponse | string>(
        loginEndpoint,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          validateStatus: (status) => status < 500,
        }
      );

      if (response.status === 401) {
        const errorData = typeof response.data === 'object' ? response.data : null;
        const errorMessage = errorData?.message || errorData?.error || 'Sin mensaje de error';
        logger.error('Error 401: Credenciales incorrectas o no autorizado', {
          status: response.status,
          endpoint: loginEndpoint,
          username: this.username,
          errorMessage,
        });
        throw new Error(`Error 401: Credenciales de CONTPAQi incorrectas o usuario no autorizado. ${errorMessage}`);
      }

      if (response.status !== 200 && response.status !== 201) {
        logger.error('Error en autenticación CONTPAQi', {
          status: response.status,
          statusText: response.statusText,
          endpoint: loginEndpoint,
        });
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      let token: string | null = null;
      
      if (typeof response.data === 'string') {
        token = response.data.trim();
      } else if (typeof response.data === 'object' && response.data !== null) {
        const possibleToken = 
          response.data.token || 
          response.data.access_token || 
          response.data.jwt ||
          response.data.Token ||
          response.data.AccessToken ||
          response.data.data;
        
        if (typeof possibleToken === 'string') {
          token = possibleToken.trim();
        }
      }

      if (!token || typeof token !== 'string' || token.length === 0) {
        logger.error('No se recibió token válido en la respuesta de autenticación CONTPAQi', {
          status: response.status,
          dataType: typeof response.data,
          endpoint: loginEndpoint,
        });
        throw new Error('No se recibió token válido en la respuesta de autenticación');
      }

      this.jwtToken = token;
      this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;

      logger.info('Autenticación CONTPAQi exitosa', {
        endpoint: loginEndpoint,
        username: this.username,
      });
    } catch (error: any) {
      // Si ya es un error que lanzamos nosotros, re-lanzarlo
      if (error.message && (error.message.includes('Error 401') || error.message.includes('Error '))) {
        throw error;
      }

      const errorMessage = error.response?.data?.message || error.message;
      const errorData = error.response?.data;
      
      logger.error(`Error al autenticar con CONTPAQi: ${errorMessage}`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: errorData,
        endpoint: this.apiUrl,
        username: this.username,
      });
      
      throw new Error(`Error al autenticar con CONTPAQi: ${errorMessage}`);
    }
  }

  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  async refreshToken(): Promise<void> {
    this.jwtToken = null;
    this.tokenExpiresAt = 0;
    await this.authenticate();
  }
}

