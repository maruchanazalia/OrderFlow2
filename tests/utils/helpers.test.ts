describe('Helper Functions', () => {
  describe('Date formatting', () => {
    it('debe formatear fecha ISO a YYYY-MM-DD', () => {
      const date = new Date('2025-01-05T12:00:00Z');
      const formatted = date.toISOString().split('T')[0];
      expect(formatted).toBe('2025-01-05');
    });

    it('debe manejar diferentes formatos de fecha', () => {
      const date1 = new Date('2025-01-05');
      const date2 = new Date('2025-01-05T00:00:00Z');
      
      expect(date1.toISOString().split('T')[0]).toBe(date2.toISOString().split('T')[0]);
    });
  });

  describe('Array handling', () => {
    it('debe convertir objeto único a array', () => {
      const obj = { id: '1' };
      const arr = Array.isArray(obj) ? obj : obj ? [obj] : [];
      expect(arr).toEqual([{ id: '1' }]);
    });

    it('debe mantener array como array', () => {
      const arr = [{ id: '1' }, { id: '2' }];
      const result = Array.isArray(arr) ? arr : arr ? [arr] : [];
      expect(result).toEqual(arr);
    });

    it('debe manejar null/undefined', () => {
      const obj: any = null;
      const arr = Array.isArray(obj) ? obj : obj ? [obj] : [];
      expect(arr).toEqual([]);
    });
  });

  describe('Number parsing', () => {
    it('debe parsear strings numéricos correctamente', () => {
      expect(parseFloat('10.5')).toBe(10.5);
      expect(parseInt('10', 10)).toBe(10);
      expect(parseFloat('0')).toBe(0);
      expect(parseFloat('-5')).toBe(-5);
    });

    it('debe manejar valores null/undefined', () => {
      expect(parseFloat(undefined as any)).toBeNaN();
      expect(parseFloat(null as any)).toBeNaN();
      expect(parseFloat('')).toBeNaN();
    });
  });

  describe('Boolean conversion', () => {
    it('debe convertir strings a booleanos', () => {
      // Simular la lógica que se usa en el código real
      const convertToBool = (value: string | undefined): boolean => {
        return value === 'true' || value === '1';
      };

      expect(convertToBool('true')).toBe(true);
      expect(convertToBool('false')).toBe(false);
      expect(convertToBool('1')).toBe(true);
      expect(convertToBool('0')).toBe(false);
      expect(convertToBool(undefined)).toBe(false);
    });
  });
});
