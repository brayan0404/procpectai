# Configuración de Supabase para ProspectAI

## 1. Crear Proyecto en Supabase

1. Ve a [https://supabase.com](https://supabase.com)
2. Crea una cuenta o inicia sesión
3. Crea un nuevo proyecto
4. Guarda estas credenciales (las necesitarás después):
   - **Project URL** (algo como: `https://xxxxxx.supabase.co`)
   - **anon/public key** (para el frontend)
   - **service_role key** (para el backend) ⚠️ NUNCA expongas esta clave en el frontend

## 2. Ejecutar el SQL de Configuración

1. En tu proyecto de Supabase, ve a **SQL Editor** (en el menú lateral)
2. Copia TODO el contenido de `supabase-setup.sql`
3. Pégalo en el editor SQL
4. Haz clic en **Run** para ejecutar
5. Verifica que se crearon las tablas:
   - `user_profiles`
   - `search_history`

## 3. Configurar Variables de Entorno

### Frontend (`frontend/.env`)

Crea el archivo `frontend/.env` con:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-public-key-aqui
VITE_API_URL=http://localhost:3000
```

Para producción (Netlify):
```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-public-key-aqui
VITE_API_URL=https://tu-backend.railway.app
```

### Backend (`backend/.env`)

Actualiza tu archivo `backend/.env` con:

```env
# Google Places API
PLACES_API_KEY=tu-google-api-key

# Supabase Configuration
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui

# Server Configuration
PORT=3000
```

⚠️ **IMPORTANTE**: Usa `SUPABASE_SERVICE_ROLE_KEY` en el backend, NO la anon key.

## 4. Verificar Autenticación en Supabase

1. Ve a **Authentication** > **Providers** en Supabase
2. Verifica que **Email** esté habilitado
3. Configuración recomendada:
   - **Confirm email**: Desactivado (para desarrollo, actívalo en producción)
   - **Secure email change**: Activado
   - **Secure password change**: Activado

## 5. Probar el Sistema

### Desarrollo Local

1. Inicia el backend:
   ```bash
   cd backend
   npm start
   ```

2. Inicia el frontend:
   ```bash
   cd frontend
   npm run dev
   ```

3. Ve a `http://localhost:5173/login`
4. Regístrate con un email y contraseña
5. Inicia sesión
6. Haz una búsqueda y verifica:
   - El contador de resultados se actualiza
   - Los lugares se guardan en el historial
   - No se muestran duplicados en búsquedas futuras
   - Al alcanzar el límite de 60 (plan free), no puedes ver más resultados

## 6. Verificar en Supabase Dashboard

Después de registrarte y hacer búsquedas:

1. Ve a **Table Editor** en Supabase
2. Revisa `user_profiles`:
   - Tu perfil debe aparecer con `plan: 'free'`
   - `total_results_limit: 60`
   - `results_shown` debe incrementarse con cada búsqueda
3. Revisa `search_history`:
   - Debe tener registros de los lugares que has visto

## 7. Actualizar un Usuario a Plan Premium

Para darle acceso premium a un usuario:

1. Ve a **Table Editor** > `user_profiles`
2. Encuentra el usuario por su email
3. Edita el registro:
   - Cambia `plan` de `'free'` a `'paid'`
   - Cambia `total_results_limit` de `60` a `1000` (o el límite que quieras)
4. Guarda los cambios
5. El usuario ahora tiene acceso a 1000 resultados

## 8. Desplegar en Producción

### Netlify (Frontend)

1. Ve a tu proyecto en Netlify
2. Site configuration > Environment variables
3. Agrega:
   ```
   VITE_SUPABASE_URL = https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY = tu-anon-key
   VITE_API_URL = https://tu-backend.railway.app
   ```
4. Redeploy el sitio

### Railway (Backend)

1. Ve a tu proyecto en Railway
2. Variables
3. Agrega o actualiza:
   ```
   SUPABASE_URL = https://tu-proyecto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY = tu-service-role-key
   ```
4. El deploy se hará automáticamente

## 9. Flujo de Negocio

### Usuario Nuevo (Free)
1. Se registra → Se crea automáticamente su perfil con plan 'free' y límite de 60 resultados
2. Hace búsquedas → Se guardan en historial, contador sube
3. Alcanza 60 resultados → No puede ver más resultados
4. Contacta por WhatsApp para plan premium

### Activar Plan Premium
1. Usuario te contacta por WhatsApp y paga $60 USD
2. Vas a Supabase > user_profiles
3. Cambias su `plan` a `'paid'` y `total_results_limit` a `1000`
4. Usuario puede seguir buscando hasta 1000 resultados

### Resetear Contador (Si es necesario)
Si un usuario paga por más resultados:
1. Ve a `user_profiles`
2. Puedes incrementar `total_results_limit` sin cambiar `results_shown`
3. O resetear `results_shown` a 0 si quieres darle 1000 nuevos resultados

## 10. Seguridad

✅ **Lo que está protegido:**
- Row Level Security (RLS) activado en todas las tablas
- Los usuarios solo ven sus propios datos
- Backend valida el token JWT en cada request
- Service role key nunca expuesta al frontend

⚠️ **Recomendaciones adicionales:**
- En producción, activa confirmación de email en Supabase
- Agrega rate limiting en el backend (express-rate-limit)
- Monitorea el uso de la API de Google Places
- Revisa logs regularmente en Railway y Supabase

## 11. Troubleshooting

### Error: "No se proporcionó token de autenticación"
- Verifica que el frontend esté enviando el header `Authorization: Bearer TOKEN`
- Verifica que el usuario haya iniciado sesión correctamente

### Error: "Perfil de usuario no encontrado"
- El trigger `on_auth_user_created` debe estar funcionando
- Verifica en Supabase > Table Editor > user_profiles si el perfil existe
- Si no existe, créalo manualmente o vuelve a registrar el usuario

### Error: "Token inválido o expirado"
- El usuario debe cerrar sesión y volver a iniciar sesión
- Verifica que las URLs de Supabase sean correctas en ambos lados

### Los resultados se duplican
- Verifica que `search_history` se esté guardando correctamente
- El filtro usa `place_id` que es `nombre_dirección` en minúsculas

### El contador no se actualiza
- Verifica que el backend esté actualizando `results_shown`
- Recarga el perfil en el frontend después de cada búsqueda
