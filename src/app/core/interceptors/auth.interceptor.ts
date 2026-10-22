import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  const authReq = req.clone({
    withCredentials: true
  });

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        localStorage.clear();
        sessionStorage.clear();
        router.navigate(['/auth/login']);
      }

      if (error.status === 403) {
        console.warn('No tienes permisos suficientes para acceder a este recurso.');
      }

      return throwError(() => error);
    })
  );
};
