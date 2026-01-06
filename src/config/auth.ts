import axios, { AxiosInstance } from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export class LightspeedAuth {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private accountId: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.clientId = process.env.LIGHTSPEED_CLIENT_ID || '';
    this.clientSecret = process.env.LIGHTSPEED_CLIENT_SECRET || '';
    this.refreshToken = process.env.LIGHTSPEED_REFRESH_TOKEN || '';
    this.accountId = process.env.LIGHTSPEED_ACCOUNT_ID || '';

    if (!this.clientId || !this.clientSecret || !this.refreshToken || !this.accountId) {
      throw new Error('Faltan credenciales de Lightspeed en las variables de entorno');
    }

    let baseURL: string;
    if (process.env.LIGHTSPEED_API_URL) {
      baseURL = process.env.LIGHTSPEED_API_URL.endsWith('/API') 
        ? process.env.LIGHTSPEED_API_URL 
        : `${process.env.LIGHTSPEED_API_URL}/API`;
    } else {
      baseURL = process.env.LIGHTSPEED_API_BASE_URL || 'https://api.lightspeedapp.com/API';
    }

    this.axiosInstance = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.axiosInstance.interceptors.request.use(async (config) => {
      const token = await this.getAccessToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          this.accessToken = null;
          const token = await this.getAccessToken();
          error.config.headers.Authorization = `Bearer ${token}`;
          return this.axiosInstance.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    await this.refreshAccessToken();
    return this.accessToken!;
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      const oauthUrl = process.env.LIGHTSPEED_OAUTH_URL || 'https://cloud.lightspeedapp.com/oauth/access_token.php';
      
      const response = await axios.post<TokenResponse>(
        oauthUrl,
        {
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiresAt = Date.now() + (expiresIn - 300) * 1000;
    } catch (error: any) {
      throw new Error(`Error al refrescar token: ${error.message}`);
    }
  }

  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  getAccountId(): string {
    return this.accountId;
  }
}

