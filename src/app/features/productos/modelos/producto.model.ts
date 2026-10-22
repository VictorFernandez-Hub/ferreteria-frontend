export type NivelStock = 'OK' | 'STOCK_MINIMO' | 'AGOTADO';

export interface Producto {
  id_producto?: number;
  codigo: string;
  nombre: string;
  descripcion?: string;

  // Relaciones (se envían al backend)
  id_categoria: number;
  id_marca: number;
  id_unidad: number;

  // Solo lectura (las devuelve el backend para mostrar en la tabla)
  categoria?: string;
  marca?: string;
  unidad?: string;
  unidad_codigo?: string;

  // Precios en soles
  precio_compra: number;
  precio_venta: number;

  // Stock: stock_actual es solo lectura (lo mueven compras, ventas y ajustes)
  stock_actual?: number;
  stock_minimo: number;
  nivel_stock?: NivelStock;

  estado: 'ACTIVO' | 'INACTIVO';
  fec_registro?: string | Date;
  fec_modifica?: string | Date;
}
