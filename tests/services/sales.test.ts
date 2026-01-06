import { SalesService } from '../../src/services/sales';
import { AxiosInstance } from 'axios';

describe('SalesService', () => {
  let salesService: SalesService;
  let mockAxios: jest.Mocked<AxiosInstance>;

  beforeEach(() => {
    mockAxios = {
      get: jest.fn(),
    } as any;

    salesService = new SalesService(mockAxios, 'test-account-id');
  });

  describe('isReturn', () => {
    it('debe detectar devolución cuando tiene línea con returned = true', () => {
      const sale = {
        saleID: '123',
        voided: 'false',
        SaleLine: [
          {
            saleLineID: '1',
            returned: 'true',
            unitQuantity: '5',
          },
        ],
      };

      expect(salesService.isReturn(sale)).toBe(true);
    });

    it('debe detectar devolución cuando tiene cantidad negativa', () => {
      const sale = {
        saleID: '123',
        voided: 'false',
        SaleLine: [
          {
            saleLineID: '1',
            unitQuantity: '-5',
          },
        ],
      };

      expect(salesService.isReturn(sale)).toBe(true);
    });

    it('debe detectar devolución cuando el total es negativo', () => {
      const sale = {
        saleID: '123',
        voided: 'false',
        total: '-100',
        SaleLine: [],
      };

      expect(salesService.isReturn(sale)).toBe(true);
    });

    it('NO debe detectar devolución cuando está voided', () => {
      const sale = {
        saleID: '123',
        voided: 'true',
        SaleLine: [
          {
            saleLineID: '1',
            returned: 'true',
          },
        ],
      };

      expect(salesService.isReturn(sale)).toBe(false);
    });

    it('NO debe detectar devolución cuando es una venta normal', () => {
      const sale = {
        saleID: '123',
        voided: 'false',
        total: '100',
        SaleLine: [
          {
            saleLineID: '1',
            unitQuantity: '5',
            returned: 'false',
          },
        ],
      };

      expect(salesService.isReturn(sale)).toBe(false);
    });

    it('debe manejar SaleLine como objeto único', () => {
      const sale = {
        saleID: '123',
        voided: 'false',
        SaleLine: {
          saleLineID: '1',
          returned: 'true',
        },
      };

      expect(salesService.isReturn(sale)).toBe(true);
    });

    it('debe manejar SaleLine como array', () => {
      const sale = {
        saleID: '123',
        voided: 'false',
        SaleLine: [
          {
            saleLineID: '1',
            returned: 'true',
          },
          {
            saleLineID: '2',
            unitQuantity: '10',
          },
        ],
      };

      expect(salesService.isReturn(sale)).toBe(true);
    });
  });

  describe('getSales y getReturns', () => {
    it('debe filtrar correctamente ventas normales', async () => {
      const mockSales = [
        {
          saleID: '1',
          total: '100',
          SaleLine: [{ unitQuantity: '5' }],
        },
        {
          saleID: '2',
          total: '-50',
          SaleLine: [{ unitQuantity: '-2' }],
        },
        {
          saleID: '3',
          total: '200',
          SaleLine: [{ returned: 'true' }],
        },
      ];

      (salesService as any).getAllSales = jest.fn().mockResolvedValue(mockSales);

      const sales = await salesService.getSales();
      expect(sales).toHaveLength(1);
      expect(sales[0].saleID).toBe('1');

      const returns = await salesService.getReturns();
      expect(returns).toHaveLength(2);
      expect(returns.map(r => r.saleID)).toEqual(['2', '3']);
    });
  });
});

