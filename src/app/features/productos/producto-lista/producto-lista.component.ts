import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule,
  ValidationErrors, ValidatorFn, Validators
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { BuscadorComponent } from '../../../shared/components/buscador/buscador.component';
import { extraerMensajeError } from '../../../shared/utils/http-error.util';
import { AuthService } from '../../../core/services/auth.service';
import { Producto } from '../modelos/producto.model';
import { Catalogo } from '../modelos/catalogo.model';
import { ProductoService } from '../servicios/producto.service';

const precioVentaValidator: ValidatorFn = (grupo: AbstractControl): ValidationErrors | null => {
  if (grupo.get('es_promocion')?.value) return null;
  const compra = Number(grupo.get('precio_compra')?.value);
  const venta = Number(grupo.get('precio_venta')?.value);
  if (isNaN(compra) || isNaN(venta) || grupo.get('precio_venta')?.value === '') return null;
  return venta < compra ? { ventaMenorQueCompra: true } : null;
};

@Component({
  selector: 'app-producto-lista',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, BuscadorComponent],
  templateUrl: './producto-lista.component.html',
  styleUrls: ['./producto-lista.component.css']
})
export class ProductoListaComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly productoService = inject(ProductoService);
  private readonly authService = inject(AuthService);

  productos = signal<Producto[]>([]);
  categorias = signal<Catalogo[]>([]);
  marcas = signal<Catalogo[]>([]);
  unidades = signal<Catalogo[]>([]);

  productoParaEditar = signal<Producto | null>(null);
  cargando = signal<boolean>(false);
  guardando = signal<boolean>(false);
  errorMessage = signal<string>('');
  errorFormulario = signal<string>('');
  termino = signal<string>('');
  soloStockBajo = signal<boolean>(false);

  readonly puedeGestionar = computed(() => this.authService.tieneRol([
    'ADMIN_SISTEMA', 'ROLE_ADMIN_SISTEMA', 'ADMIN_NEGOCIO', 'ROLE_ADMIN_NEGOCIO', 'ALMACENERO', 'ROLE_ALMACENERO'
  ]));

  productosFiltrados = computed(() => {
    const t = this.termino().trim().toLowerCase();
    return this.productos().filter(p => {
      const coincideTexto = !t ||
        p.codigo.toLowerCase().includes(t) ||
        p.nombre.toLowerCase().includes(t) ||
        (p.categoria ?? '').toLowerCase().includes(t) ||
        (p.marca ?? '').toLowerCase().includes(t);
      const coincideStock = !this.soloStockBajo() || p.nivel_stock !== 'OK';
      return coincideTexto && coincideStock;
    });
  });

  totalStockBajo = computed(() =>
    this.productos().filter(p => p.estado === 'ACTIVO' && p.nivel_stock !== 'OK').length
  );

  productoForm!: FormGroup;

  
  ngOnInit(): void {
    this.initForm();
    this.cargarCatalogos();
    this.cargarProductos();
  }

  private initForm(): void {
    this.productoForm = this.fb.group({
      id_producto: [{ value: null, disabled: true }],
      codigo: [{ value: '', disabled: true }],
      nombre: ['', [Validators.required, Validators.maxLength(150)]],
      descripcion: ['', [Validators.maxLength(300)]],
      id_categoria: [null, [Validators.required]],
      id_marca: [null, [Validators.required]],
      id_unidad: [null, [Validators.required]],
      precio_compra: [0, [Validators.required, Validators.min(0)]],
      precio_venta: [0, [Validators.required, Validators.min(0)]],
      es_promocion: [false],
      stock_minimo: [0, [Validators.required, Validators.min(0)]],
      estado: ['ACTIVO', [Validators.required]]
    }, { validators: precioVentaValidator });
  }

  private cargarCatalogos(): void {
    forkJoin({
      categorias: this.productoService.obtenerCategorias(),
      marcas: this.productoService.obtenerMarcas(),
      unidades: this.productoService.obtenerUnidades()
    }).subscribe({
      next: ({ categorias, marcas, unidades }) => {
        this.categorias.set(categorias);
        this.marcas.set(marcas);
        this.unidades.set(unidades);
      },
      error: (err: HttpErrorResponse) => {
        this.errorMessage.set(extraerMensajeError(err, 'No se pudieron cargar categorías, marcas y unidades.'));
      }
    });
  }

  cargarProductos(): void {
    this.cargando.set(true);
    this.errorMessage.set('');
    this.productoService.obtenerProductos().subscribe({
      next: (data) => {
        const ordenados = [...data].sort((a, b) =>
          String(a.codigo).localeCompare(String(b.codigo))
        );
        this.productos.set(ordenados);
        this.cargando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.errorMessage.set(extraerMensajeError(err, 'No se pudieron cargar los productos.'));
        this.cargando.set(false);
      }
    });
  }

  siguienteCodigo(): string {
    const usados = new Set(
      this.productos().map(p => {
        const m = String(p.codigo).match(/(\d+)$/);
        return m ? Number(m[1]) : 0;
      })
    );
    let n = 1;
    while (usados.has(n)) n++;
    return 'HER-' + String(n).padStart(3, '0');
  }

  filtrarProductos(termino: string): void {
    this.termino.set(termino);
  }

  alternarStockBajo(): void {
    this.soloStockBajo.update(v => !v);
  }

  esInvalido(campo: string): boolean {
    const control = this.productoForm.get(campo);
    return !!control && control.touched && control.invalid;
  }

  ventaMenorQueCompra(): boolean {
    if (this.productoForm.get('es_promocion')?.value) return false;
    return !!this.productoForm.errors?.['ventaMenorQueCompra'] &&
      !!this.productoForm.get('precio_venta')?.touched;
  }

  margen(): number | null {
    const compra = Number(this.productoForm.get('precio_compra')?.value);
    const venta = Number(this.productoForm.get('precio_venta')?.value);
    if (!compra || compra <= 0 || isNaN(venta)) return null;
    return ((venta - compra) / compra) * 100;
  }

  prepararNuevo(): void {
    this.errorFormulario.set('');
    this.productoParaEditar.set(null);
    this.resetearFormulario();
    this.productoForm.patchValue({ codigo: this.siguienteCodigo() });
  }

  editarProducto(p: Producto): void {
    this.errorFormulario.set('');
    this.productoParaEditar.set(p);
    this.productoForm.patchValue({
      id_producto: p.id_producto,
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      id_categoria: p.id_categoria,
      id_marca: p.id_marca,
      id_unidad: p.id_unidad,
      precio_compra: p.precio_compra,
      precio_venta: p.precio_venta,
      es_promocion: (p as any).es_promocion || false,
      stock_minimo: p.stock_minimo,
      estado: p.estado
    });
  }

  guardarProducto(): void {
    if (this.productoForm.invalid) {
      this.productoForm.markAllAsTouched();
      return;
    }
    this.errorFormulario.set('');
    this.guardando.set(true);
    const v = this.productoForm.getRawValue();
    const producto: Producto = {
      ...v,
      codigo: String(v.codigo).trim().toUpperCase(),
      id_categoria: Number(v.id_categoria),
      id_marca: Number(v.id_marca),
      id_unidad: Number(v.id_unidad),
      precio_compra: Number(v.precio_compra),
      precio_venta: Number(v.precio_venta),
      stock_minimo: Number(v.stock_minimo)
    };

    const editando = this.productoParaEditar();
    const peticion = editando
      ? this.productoService.actualizarProducto(editando.id_producto!, producto)
      : this.productoService.crearProducto(producto);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.cargarProductos();
        this.cerrarModal();
      },
      error: (err: HttpErrorResponse) => {
        this.guardando.set(false);
        this.errorFormulario.set(extraerMensajeError(err, 'No se pudo guardar el producto.'));
      }
    });
  }

  cambiarEstado(p: Producto): void {
    const nuevoEstado = p.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    this.productoService.actualizarProducto(p.id_producto!, { ...p, estado: nuevoEstado }).subscribe({
      next: () => this.cargarProductos(),
      error: (err: HttpErrorResponse) => {
        this.errorMessage.set(extraerMensajeError(err, 'No se pudo cambiar el estado del producto.'));
      }
    });
  }

  eliminarProducto(p: Producto): void {
    if (!p.id_producto) return;
    if (!confirm(`¿Eliminar el producto "${p.codigo} - ${p.nombre}"?`)) return;
    this.productoService.eliminarProducto(p.id_producto).subscribe({
      next: () => this.cargarProductos(),
      error: (err: HttpErrorResponse) => {
        this.errorMessage.set(extraerMensajeError(err, 'No se pudo eliminar el producto.'));
      }
    });
  }

  resetearFormulario(): void {
    this.productoForm.reset({
      id_producto: this.productoParaEditar()?.id_producto ?? null,
      codigo: '',
      nombre: '',
      descripcion: '',
      id_categoria: null,
      id_marca: null,
      id_unidad: null,
      precio_compra: 0,
      precio_venta: 0,
      es_promocion: false,
      stock_minimo: 0,
      estado: 'ACTIVO'
    });
  }
  
  private cerrarModal(): void {
    const modalElement = document.getElementById('modalRegistroPro');
    if (modalElement) {
      const modalInstance = (window as any).bootstrap?.Modal?.getInstance(modalElement);
      modalInstance?.hide();
    }
    
  }
  margenDe(p: any): number {
  if (!p.precio_compra || p.precio_compra === 0) return 0;
  return ((p.precio_venta - p.precio_compra) / p.precio_compra) * 100;
  }
}