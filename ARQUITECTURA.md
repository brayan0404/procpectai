# 📋 Arquitectura ProspectAI

## 📐 Índice
1. [Visión General](#visión-general)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Arquitectura del Sistema](#arquitectura-del-sistema)
4. [Base de Datos](#base-de-datos)
5. [API Endpoints](#api-endpoints)
6. [Flujo de Autenticación](#flujo-de-autenticación)
7. [Flujo de Búsqueda](#flujo-de-búsqueda)
8. [Sistema de Límites](#sistema-de-límites)
9. [Exportación de Datos](#exportación-de-datos)
10. [Integración con WhatsApp](#integración-con-whatsapp)
11. [Seguridad](#seguridad)
12. [Variables de Entorno](#variables-de-entorno)

---

## 🎯 Visión General

**ProspectAI** es una plataforma SaaS que permite a empresas encontrar clientes potenciales mediante búsquedas inteligentes en Google Places API. El sistema divide ciudades en grids para realizar búsquedas exhaustivas y devuelve únicamente negocios con información de contacto válida.

### Características Principales
- 🔐 Sistema de autenticación con registro/login
- 🗺️ Búsqueda avanzada por grids geográficos (10x10 = 100 búsquedas)
- 📊 Sistema de planes (Free: 60 resultados, Premium: 1000+)
- 📱 Integración directa con WhatsApp
- 📥 Exportación masiva a Excel
- 🔄 Filtrado automático de duplicados
- 🎯 Solo muestra negocios con teléfono o sitio web

---

## 🛠️ Stack Tecnológico

### **Frontend**
```json
{
  "framework": "React 19.1.1",
  "bundler": "Vite 7.1.7",
  "routing": "React Router DOM 7.9.6",
  "auth": "Supabase Auth (@supabase/supabase-js 2.84.0)",
  "exports": "xlsx 0.18.5",
  "styling": "CSS puro (App.css, Login.css)"
}
```

### **Backend**
```json
{
  "runtime": "Node.js",
  "framework": "Express 5.1.0",
  "auth": "Supabase Auth + JWT",
  "database": "Supabase PostgreSQL",
  "http-client": "Axios 1.13.2",
  "cors": "cors 2.8.5",
  "env": "dotenv 17.2.3"
}
```

### **APIs Externas**
- **Google Places API (New)**: Text Search + Place Details
- **Google Geocoding API**: Conversión ciudad → coordenadas
- **Supabase**: Autenticación, base de datos, RLS

### **Infraestructura**
- **Frontend**: Netlify (deploy automático desde git)
- **Backend**: Railway (deploy automático)
- **Base de Datos**: Supabase (PostgreSQL gestionado)

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE (Browser)                        │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────────┐  │
│  │   Login    │  │   Search   │  │    Results Table       │  │
│  │  (React)   │  │  (React)   │  │    + Excel Export      │  │
│  └────────────┘  └────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                    │                         │
         │ Auth              │ Search                  │ Export
         ▼                    ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API (Express)                       │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐    │
│  │ authMiddleware│→│  /search    │  │   /load-details    │    │
│  │ (JWT verify) │  │  (grids)    │  │   (batch load)     │    │
│  └──────────────┘  └─────────────┘  └────────────────────┘    │
│         │                 │                    │                │
│         │                 │                    │                │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐    │
│  │  /geocode    │  │  /history   │  │  Supabase Client   │    │
│  │  (bounds)    │  │  (export)   │  │  (Service Role)    │    │
│  └──────────────┘  └─────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
         │                    │                         │
         ▼                    ▼                         ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Google Places  │  │    Supabase      │  │  Google Geocode  │
│      API        │  │   PostgreSQL     │  │       API        │
│                 │  │                  │  │                  │
│ • Text Search   │  │ • user_profiles  │  │ • City bounds    │
│ • Place Details │  │ • search_history │  │ • Coordinates    │
└─────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 💾 Base de Datos

### **Esquema Supabase**

#### **Tabla: `user_profiles`**
```sql
CREATE TABLE public.user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',           -- 'free' | 'paid'
  total_results_limit INTEGER DEFAULT 60,      -- Límite total de resultados
  results_shown INTEGER DEFAULT 0,             -- Contador de resultados mostrados
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

**Propósito**: 
- Extender datos de `auth.users` con lógica de negocio
- Controlar límites de uso por plan (free/paid)
- Rastrear consumo de resultados

**Creación Automática**:
```sql
-- Trigger que crea perfil al registrarse
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

#### **Tabla: `search_history`**
```sql
CREATE TABLE public.search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  place_id TEXT NOT NULL,                     -- ID único del lugar
  place_name TEXT,
  address TEXT,
  phone TEXT,
  international_phone TEXT,
  website TEXT,
  rating NUMERIC,
  user_ratings_total INTEGER,
  maps_url TEXT,
  query TEXT NOT NULL,                         -- Término de búsqueda
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  searched_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_search_history_user_id ON search_history(user_id);
CREATE INDEX idx_search_history_place_id ON search_history(user_id, place_id);
```

**Propósito**:
- Guardar cada lugar mostrado al usuario
- Evitar duplicados en búsquedas futuras
- Habilitar exportación masiva a Excel
- Auditoría de uso

#### **Row Level Security (RLS)**
```sql
-- user_profiles
CREATE POLICY "Users can view own profile" 
  ON user_profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON user_profiles FOR UPDATE 
  USING (auth.uid() = id);

-- search_history
CREATE POLICY "Users can view own search history" 
  ON search_history FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own search history" 
  ON search_history FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
```

**Seguridad**: 
- Cada usuario solo ve/modifica sus propios datos
- Implementado a nivel de base de datos (no depende del backend)

---

## 🔌 API Endpoints

### **Backend Base URL**
- **Desarrollo**: `http://localhost:3000`
- **Producción**: `https://tu-backend.railway.app`

---

### **1. GET `/geocode`**

**Descripción**: Obtiene las coordenadas y bounds de una ciudad usando Google Geocoding API.

**Autenticación**: ❌ No requerida

**Parámetros Query**:
```javascript
{
  city: "Medellín",      // Requerido
  country: "Colombia"    // Requerido
}
```

**Request**:
```http
GET /geocode?city=Medellín&country=Colombia
```

**Response 200**:
```json
{
  "bounds": {
    "northeast": { "lat": 6.3878487, "lng": -75.4816293 },
    "southwest": { "lat": 6.1286897, "lng": -75.6467102 }
  },
  "location": { "lat": 6.2476376, "lng": -75.5658153 }
}
```

**Response 404**:
```json
{
  "error": "Ciudad no encontrada"
}
```

**Response 400**:
```json
{
  "error": "Debes enviar city y country"
}
```

**Uso**: El frontend usa este endpoint para validar que la ciudad exista antes de ejecutar búsquedas (aunque actualmente no se usa en el flujo principal, está disponible).

---

### **2. GET `/search`** 🔐

**Descripción**: Búsqueda principal con sistema de grids. Divide la ciudad en 100 grids (10x10) y busca en cada uno, devolviendo solo IDs de lugares únicos que el usuario no ha visto antes.

**Autenticación**: ✅ Requerida (JWT Bearer Token)

**Headers**:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Parámetros Query**:
```javascript
{
  query: "restaurantes",    // Requerido: término de búsqueda
  city: "Medellín",         // Requerido
  country: "Colombia"       // Requerido
}
```

**Request**:
```http
GET /search?query=restaurantes&city=Medellín&country=Colombia
Authorization: Bearer TOKEN
```

**Flujo Interno**:

1. **Validar autenticación** (middleware)
   ```javascript
   const token = req.headers.authorization.split(' ')[1];
   const { user, userProfile } = await supabase.auth.getUser(token);
   ```

2. **Validar límite de usuario**
   ```javascript
   if (userProfile.results_shown >= userProfile.total_results_limit) {
     return 403: "Has alcanzado tu límite de X resultados"
   }
   ```

3. **Geocoding de la ciudad**
   ```javascript
   // Llamada a Google Geocoding API
   const bounds = await geocodeCity(city, country);
   ```

4. **Crear grids 10x10 = 100 búsquedas**
   ```javascript
   function createGrids(bounds, gridSize = 10) {
     // Divide bounds en una matriz de 10x10
     // Cada grid tiene un centro (lat, lng) y radio
     // Radio máximo: 50km (límite de Google Places)
   }
   ```

5. **Buscar en cada grid con paginación**
   ```javascript
   // Para cada grid:
   for (let grid of grids) {
     let pageToken = null;
     do {
       // Text Search API (max 20 resultados por página)
       const response = await textSearch({
         textQuery: query,
         locationBias: {
           circle: { center: grid.center, radius: grid.radius }
         },
         maxResultCount: 20
       });
       
       placeIds.push(...response.places.map(p => p.id));
       pageToken = response.nextPageToken;
     } while (pageToken && pageCount < 3); // Máx 3 páginas por grid
   }
   ```

6. **Consolidar IDs únicos**
   ```javascript
   const uniquePlaceIds = [...new Set(allPlaceIds)]; // Eliminar duplicados
   ```

7. **Filtrar lugares ya vistos**
   ```javascript
   const { data: history } = await supabase
     .from('search_history')
     .select('place_id')
     .eq('user_id', user.id);
   
   const shownPlaceIds = new Set(history.map(h => h.place_id));
   const newPlaceIds = uniquePlaceIds.filter(id => !shownPlaceIds.has(id));
   ```

8. **Aplicar límite de usuario**
   ```javascript
   const remainingLimit = userProfile.total_results_limit - userProfile.results_shown;
   const availablePlaceIds = newPlaceIds.slice(0, remainingLimit);
   ```

**Response 200**:
```json
{
  "placeIds": [
    "ChIJN1t_tDeuEmsRUsoyG83frY4",
    "ChIJP3Sa8ziYEmsRUKgyFmh9AQM",
    ...
  ],
  "totalFound": 1523,              // Total de lugares encontrados
  "newPlaces": 1245,               // Lugares que no habías visto
  "availableToLoad": 60,           // Lugares disponibles según tu límite
  "remainingLimit": 60,            // Resultados restantes en tu plan
  "userPlan": "free"
}
```

**Response 403** (límite alcanzado):
```json
{
  "error": "Has alcanzado tu límite de 60 resultados. Contacta para actualizar a Plan Premium.",
  "limit_reached": true
}
```

**Response 401** (sin autenticación):
```json
{
  "error": "No se proporcionó token de autenticación"
}
```

**Response 404** (ciudad no encontrada):
```json
{
  "error": "Ciudad no encontrada",
  "geocodingStatus": "ZERO_RESULTS"
}
```

**Datos Solicitados a Google Places API**:
- **Text Search**: Solo `places.id` y `nextPageToken` (fieldMask mínimo)
- **Sin detalles en esta etapa** para optimizar cuota

**Llamadas API**:
- **1 llamada a Geocoding API** (bounds de la ciudad)
- **Hasta 300 llamadas a Text Search API** (100 grids × 3 páginas máx)

---

### **3. POST `/load-details`** 🔐

**Descripción**: Carga los detalles completos de un batch de lugares. Filtra automáticamente lugares sin teléfono Y sin sitio web. Guarda en historial y actualiza contador.

**Autenticación**: ✅ Requerida (JWT Bearer Token)

**Headers**:
```http
Content-Type: application/json
Authorization: Bearer TOKEN
```

**Body**:
```json
{
  "placeIds": [
    "ChIJN1t_tDeuEmsRUsoyG83frY4",
    "ChIJP3Sa8ziYEmsRUKgyFmh9AQM"
  ],
  "query": "restaurantes",    // Opcional: para guardar en historial
  "city": "Medellín",         // Opcional: para guardar en historial
  "country": "Colombia"       // Opcional: para guardar en historial
}
```

**Flujo Interno**:

1. **Validar array de IDs**
   ```javascript
   if (!Array.isArray(placeIds) || placeIds.length === 0) {
     return 400: "Debes enviar un array de placeIds"
   }
   ```

2. **Verificar límite restante**
   ```javascript
   const remainingLimit = userProfile.total_results_limit - userProfile.results_shown;
   const idsToLoad = placeIds.slice(0, remainingLimit);
   ```

3. **Cargar detalles en paralelo**
   ```javascript
   const detailsPromises = idsToLoad.map(async placeId => {
     const response = await axios.get(
       `https://places.googleapis.com/v1/${placeId}`,
       {
         headers: {
           "X-Goog-Api-Key": API_KEY,
           "X-Goog-FieldMask": "id,displayName,formattedAddress,rating,userRatingCount,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri"
         }
       }
     );
     return response.data;
   });
   
   const places = await Promise.all(detailsPromises);
   ```

4. **Filtrar lugares con contacto**
   ```javascript
   const placesWithContact = places.filter(p => p.phone || p.website);
   ```

5. **Guardar en historial (batch insert)**
   ```javascript
   await supabase
     .from('search_history')
     .insert(placesWithContact.map(place => ({
       user_id: user.id,
       place_id: place.id,
       place_name: place.name,
       address: place.address,
       phone: place.phone,
       international_phone: place.international_phone,
       website: place.website,
       rating: place.rating,
       user_ratings_total: place.user_ratings_total,
       maps_url: place.maps_url,
       query: query,
       city: city,
       country: country
     })));
   ```

6. **Actualizar contador**
   ```javascript
   await supabase
     .from('user_profiles')
     .update({ 
       results_shown: userProfile.results_shown + placesWithContact.length 
     })
     .eq('id', user.id);
   ```

**Response 200**:
```json
{
  "places": [
    {
      "id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
      "name": "Restaurante El Cielo",
      "address": "Calle 10 #38-26, Medellín, Colombia",
      "phone": "+57 4 311 2399",
      "international_phone": "+57 4 311 2399",
      "website": "https://www.elcielo.com.co",
      "rating": 4.6,
      "user_ratings_total": 1234,
      "maps_url": "https://maps.google.com/?cid=123456789"
    }
  ],
  "loaded": 18,                    // Lugares cargados con contacto
  "newRemainingLimit": 42,         // Límite actualizado
  "limit_reached": false
}
```

**Response 403** (límite alcanzado):
```json
{
  "error": "Has alcanzado tu límite de 60 resultados.",
  "limit_reached": true
}
```

**Datos Solicitados a Google Places API**:
```javascript
"X-Goog-FieldMask": "id,displayName,formattedAddress,rating,userRatingCount,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri"
```

**Campos Devueltos**:
- `id`: ID único del lugar
- `displayName.text`: Nombre del negocio
- `formattedAddress`: Dirección completa
- `nationalPhoneNumber`: Teléfono local
- `internationalPhoneNumber`: Teléfono internacional (para WhatsApp)
- `websiteUri`: Sitio web
- `rating`: Valoración (1-5)
- `userRatingCount`: Número de reseñas
- `googleMapsUri`: URL de Google Maps

**Llamadas API**:
- **N llamadas a Place Details API** (1 por cada ID en el array)
- Ejecutadas en paralelo con `Promise.all`

---

### **4. GET `/history`** 🔐

**Descripción**: Obtiene todo el historial de búsquedas del usuario para exportación a Excel.

**Autenticación**: ✅ Requerida (JWT Bearer Token)

**Headers**:
```http
Authorization: Bearer TOKEN
```

**Request**:
```http
GET /history
Authorization: Bearer TOKEN
```

**Flujo Interno**:
```javascript
const { data: history } = await supabase
  .from('search_history')
  .select('*')
  .eq('user_id', user.id)
  .order('searched_at', { ascending: false });
```

**Response 200**:
```json
{
  "history": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "place_id": "ChIJ...",
      "place_name": "Restaurante El Cielo",
      "address": "Calle 10 #38-26, Medellín",
      "phone": "+57 4 311 2399",
      "international_phone": "+57 4 311 2399",
      "website": "https://www.elcielo.com.co",
      "rating": 4.6,
      "user_ratings_total": 1234,
      "maps_url": "https://maps.google.com/?cid=123",
      "query": "restaurantes",
      "city": "Medellín",
      "country": "Colombia",
      "searched_at": "2024-11-22T15:30:00Z"
    }
  ]
}
```

**Uso**: 
- El frontend consume este endpoint al hacer clic en "Descargar Excel"
- Convierte los datos a formato XLSX usando la librería `xlsx`

---

## 🔐 Flujo de Autenticación

### **Registro de Usuario**

```mermaid
sequenceDiagram
    participant U as Usuario
    participant F as Frontend
    participant S as Supabase Auth
    participant DB as Supabase DB
    
    U->>F: Ingresa email/password
    F->>S: supabase.auth.signUp({email, password})
    S->>DB: INSERT INTO auth.users
    DB->>DB: TRIGGER: on_auth_user_created
    DB->>DB: INSERT INTO user_profiles<br/>(plan='free', limit=60)
    S-->>F: {user, session}
    F-->>U: "Cuenta creada"
```

**Código Frontend**:
```javascript
const { data, error } = await supabase.auth.signUp({
  email: 'usuario@email.com',
  password: 'contraseña123'
});
```

**Trigger Automático**:
```sql
-- Ejecuta automáticamente al crear usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Función que crea el perfil
CREATE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, plan, total_results_limit, results_shown)
  VALUES (NEW.id, NEW.email, 'free', 60, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### **Login de Usuario**

```mermaid
sequenceDiagram
    participant U as Usuario
    participant F as Frontend
    participant S as Supabase Auth
    participant DB as Supabase DB
    
    U->>F: Ingresa email/password
    F->>S: supabase.auth.signInWithPassword()
    S->>DB: Valida credenciales
    S-->>F: {user, session, access_token}
    F->>DB: SELECT * FROM user_profiles WHERE id=user.id
    DB-->>F: {plan, total_results_limit, results_shown}
    F-->>U: Redirige a /search
```

**Código Frontend**:
```javascript
// 1. Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'usuario@email.com',
  password: 'contraseña123'
});

// 2. Obtener perfil
const { data: profile } = await supabase
  .from('user_profiles')
  .select('*')
  .eq('id', data.user.id)
  .single();

setUserProfile(profile); // {plan: 'free', results_shown: 15, total_results_limit: 60}
```

---

### **Validación en Backend (Middleware)**

```mermaid
sequenceDiagram
    participant F as Frontend
    participant M as authMiddleware
    participant S as Supabase
    participant DB as Supabase DB
    participant E as Endpoint
    
    F->>M: Request con header Authorization: Bearer TOKEN
    M->>S: supabase.auth.getUser(token)
    S->>DB: Valida JWT y obtiene usuario
    DB-->>S: {user}
    S-->>M: {user}
    M->>DB: SELECT * FROM user_profiles WHERE id=user.id
    DB-->>M: {userProfile}
    M->>M: req.user = user<br/>req.userProfile = userProfile
    M->>E: next() (permite continuar)
    E->>E: Procesa request con contexto de usuario
```

**Código Backend**:
```javascript
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No se proporcionó token' });
  }

  const token = authHeader.split(' ')[1];

  // Validar token con Supabase
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Obtener perfil del usuario
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return res.status(404).json({ error: 'Perfil no encontrado' });
  }

  req.user = user;             // {id, email, ...}
  req.userProfile = profile;    // {plan, results_shown, total_results_limit}
  next();
}

// Aplicar a endpoints protegidos
app.get("/search", authMiddleware, async (req, res) => {
  // req.user y req.userProfile están disponibles
});
```

---

### **Persistencia de Sesión**

**Frontend** mantiene la sesión automáticamente:

```javascript
useEffect(() => {
  // 1. Obtener sesión actual al cargar la app
  supabase.auth.getSession().then(({ data: { session } }) => {
    setUser(session?.user ?? null);
  });

  // 2. Escuchar cambios de autenticación
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      setUser(session?.user ?? null);
      
      if (!session) {
        navigate('/login'); // Redirigir si sesión expiró
      }
    }
  );

  return () => subscription.unsubscribe();
}, []);
```

**Token JWT**:
- Almacenado automáticamente por Supabase en `localStorage`
- Duración: 1 hora (por defecto)
- Renovación automática si el usuario está activo

---

## 🔍 Flujo de Búsqueda

### **Búsqueda Completa (Frontend → Backend → Google Places)**

```mermaid
sequenceDiagram
    participant U as Usuario
    participant F as Frontend
    participant B as Backend
    participant G as Google Geocoding
    participant P as Google Places
    participant DB as Supabase
    
    U->>F: Ingresa "restaurantes" + "Medellín" + "Colombia"
    F->>F: Validar inputs
    F->>B: GET /search?query=restaurantes&city=Medellín&country=Colombia<br/>Authorization: Bearer TOKEN
    
    Note over B: authMiddleware valida token y obtiene perfil
    
    B->>B: Validar límite usuario<br/>(results_shown < total_results_limit)
    
    B->>G: Geocode "Medellín, Colombia"
    G-->>B: {bounds: {northeast, southwest}}
    
    B->>B: createGrids(bounds, 10)<br/>Genera 100 grids (10x10)
    
    loop Por cada grid (100 búsquedas)
        B->>P: Text Search API<br/>{textQuery, locationBias: circle}<br/>FieldMask: id, nextPageToken
        P-->>B: {places: [{id}], nextPageToken}
        
        opt Si hay nextPageToken (max 3 páginas)
            B->>P: Text Search con pageToken
            P-->>B: Más place IDs
        end
    end
    
    B->>B: Consolidar IDs únicos<br/>(Set para eliminar duplicados)
    
    B->>DB: SELECT place_id FROM search_history<br/>WHERE user_id = current_user
    DB-->>B: {place_ids: [...]}
    
    B->>B: Filtrar IDs ya vistos<br/>newPlaceIds = all - history
    
    B->>B: Aplicar límite de usuario<br/>availableIds = newPlaceIds.slice(0, remainingLimit)
    
    B-->>F: {placeIds: [...], totalFound, newPlaces, availableToLoad}
    
    F->>B: POST /load-details<br/>{placeIds: first20}
    
    Note over B: Por cada ID en paralelo
    
    loop Por cada place ID (batch de 20)
        B->>P: Place Details API<br/>FieldMask: name, address, phone, website, rating...
        P-->>B: {displayName, formattedAddress, ...}
    end
    
    B->>B: Filtrar lugares con contacto<br/>(phone OR website)
    
    B->>DB: INSERT INTO search_history (batch)
    B->>DB: UPDATE user_profiles<br/>SET results_shown += loaded
    
    B-->>F: {places: [...], loaded, newRemainingLimit}
    
    F->>F: Renderizar tabla de resultados
    F-->>U: Mostrar leads con contacto
```

---

### **Sistema de Grids Geográficos**

**¿Por qué grids?**
- Google Places Text Search tiene un límite de 20 resultados por búsqueda
- Con paginación (nextPageToken) puedes obtener hasta 60 resultados por ubicación
- Para ciudades grandes (Medellín, Bogotá), 60 resultados son insuficientes
- **Solución**: Dividir la ciudad en grids y buscar en cada uno

**Algoritmo de Grids**:

```javascript
function createGrids(bounds, gridSize = 10) {
  const { northeast, southwest } = bounds;
  
  // Calcular paso de latitud y longitud
  const latStep = (northeast.lat - southwest.lat) / gridSize;
  const lngStep = (northeast.lng - southwest.lng) / gridSize;
  
  const grids = [];
  
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      // Centro del grid
      const centerLat = southwest.lat + (i + 0.5) * latStep;
      const centerLng = southwest.lng + (j + 0.5) * lngStep;
      
      // Calcular radio (diagonal del grid / 2)
      const latDistance = latStep * 111000; // 111km por grado de latitud
      const lngDistance = lngStep * 111000 * Math.cos(centerLat * Math.PI / 180);
      const radius = Math.sqrt(latDistance ** 2 + lngDistance ** 2) / 2;
      
      grids.push({
        center: { lat: centerLat, lng: centerLng },
        radius: Math.min(radius, 50000) // Máximo 50km (límite de Google)
      });
    }
  }
  
  return grids; // 100 grids
}
```

**Ejemplo Visual (Medellín dividido en 10x10)**:

```
        Bounds de Medellín
┌─────────────────────────────────┐
│  G1  G2  G3  G4  G5  G6  G7  G8  G9  G10 │
│ G11 G12 G13 G14 G15 G16 G17 G18 G19 G20 │
│ G21 G22 G23 G24 G25 G26 G27 G28 G29 G30 │
│  ...                          ... │
│ G91 G92 G93 G94 G95 G96 G97 G98 G99 G100│
└─────────────────────────────────┘

Cada grid:
- Centro: (lat, lng)
- Radio: ~5-15km (depende del tamaño de la ciudad)
- Búsquedas: 3 páginas × 20 resultados = 60 max por grid
```

**Búsqueda en Grids**:

```javascript
const gridSearchPromises = grids.map(async (grid, index) => {
  const gridPlaceIds = [];
  let pageToken = null;
  let pageCount = 0;
  const maxPages = 3;

  do {
    const response = await axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      {
        textQuery: query, // "restaurantes"
        maxResultCount: 20,
        locationBias: {
          circle: {
            center: {
              latitude: grid.center.lat,
              longitude: grid.center.lng
            },
            radius: grid.radius
          }
        },
        pageToken: pageToken // Solo en páginas 2 y 3
      },
      {
        headers: {
          "X-Goog-Api-Key": PLACES_API_KEY,
          "X-Goog-FieldMask": "places.id,nextPageToken"
        }
      }
    );

    gridPlaceIds.push(...response.data.places.map(p => p.id));
    pageToken = response.data.nextPageToken;
    pageCount++;

  } while (pageToken && pageCount < maxPages);

  return gridPlaceIds;
});

// Ejecutar las 100 búsquedas en paralelo
const gridResults = await Promise.all(gridSearchPromises);
```

**Resultados Típicos**:
- **100 grids × 3 páginas × 20 resultados = hasta 6,000 IDs**
- Después de eliminar duplicados: ~1,500-3,000 lugares únicos
- Después de filtrar historial: ~1,000-2,000 lugares nuevos

---

### **Carga Bajo Demanda (Load More)**

**Frontend** carga resultados en batches de 20:

```javascript
const loadMoreResults = async (
  placeIds = availablePlaceIds, 
  startIndex = loadedCount, 
  targetCount = 20
) => {
  let totalLoaded = 0;
  let currentIndex = startIndex;
  
  // Continuar hasta obtener 20 resultados CON CONTACTO
  while (totalLoaded < targetCount && currentIndex < placeIds.length) {
    // Cargar batch de 20 IDs
    const idsToLoad = placeIds.slice(currentIndex, currentIndex + 20);
    
    const response = await fetch(`${API_URL}/load-details`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ placeIds: idsToLoad, query, city, country })
    });

    const data = await response.json();

    // Agregar nuevos resultados
    if (data.places && data.places.length > 0) {
      setResults(prev => [...prev, ...data.places]);
      totalLoaded += data.loaded;
    }
    
    currentIndex += idsToLoad.length;
    setLoadedCount(currentIndex);

    // Si ya no hay más IDs o alcanzamos el límite, salir
    if (currentIndex >= placeIds.length || data.limit_reached) {
      break;
    }
  }

  return totalLoaded;
};
```

**¿Por qué cargar bajo demanda?**
- **Optimizar cuota de Google Places API**: Solo cargar detalles de lugares que el usuario verá
- **Mejorar UX**: Mostrar resultados inmediatamente (primeros 20) en vez de esperar 5 minutos
- **Reducir carga en backend**: No procesar 1,500 IDs de golpe

**Flujo**:
1. Usuario hace búsqueda → Backend devuelve 1,000 IDs
2. Frontend automáticamente carga primeros 20 detalles
3. Usuario ve tabla con 20 resultados
4. Usuario hace scroll y click "Cargar más" → Frontend pide siguientes 20
5. Se repite hasta agotar IDs o alcanzar límite del usuario

---

## 🎯 Sistema de Límites

### **Planes de Usuario**

| Plan     | Límite de Resultados | Precio      | Soporte  |
|----------|---------------------|-------------|----------|
| **Free** | 60 lugares          | Gratis      | Email    |
| **Paid** | 1000+ lugares       | $60 USD+    | WhatsApp |

---

### **Lógica de Límites**

```javascript
// En /search
if (userProfile.results_shown >= userProfile.total_results_limit) {
  return res.status(403).json({ 
    error: `Has alcanzado tu límite de ${userProfile.total_results_limit} resultados.`,
    limit_reached: true
  });
}

const remainingLimit = userProfile.total_results_limit - userProfile.results_shown;
const availablePlaceIds = newPlaceIds.slice(0, remainingLimit);

// Devolver solo los IDs que puede cargar
res.json({
  placeIds: availablePlaceIds,
  remainingLimit: remainingLimit
});
```

```javascript
// En /load-details
const remainingLimit = userProfile.total_results_limit - userProfile.results_shown;
const idsToLoad = placeIds.slice(0, Math.min(placeIds.length, remainingLimit));

// Cargar detalles...
const placesWithContact = detailedPlaces.filter(p => p.phone || p.website);

// Actualizar contador
await supabase
  .from('user_profiles')
  .update({ 
    results_shown: userProfile.results_shown + placesWithContact.length 
  })
  .eq('id', user.id);
```

---

### **¿Qué cuenta como "resultado mostrado"?**

✅ **Cuenta**:
- Lugares con teléfono o sitio web que se guardan en `search_history`
- Solo cuando el backend ejecuta `/load-details` exitosamente

❌ **NO cuenta**:
- IDs devueltos por `/search` (aún no se han cargado detalles)
- Lugares sin teléfono NI sitio web (se filtran y no se guardan)
- Lugares que el usuario ya vio antes (se filtran desde `/search`)

**Ejemplo**:
```
Usuario Free (límite: 60)
├─ Búsqueda 1: "restaurantes Medellín"
│  ├─ /search devuelve 1,000 IDs
│  ├─ /load-details carga 20 IDs → 18 tienen contacto
│  └─ results_shown: 0 → 18 ✅
│
├─ Clic "Cargar más"
│  ├─ /load-details carga 20 IDs → 15 tienen contacto
│  └─ results_shown: 18 → 33 ✅
│
├─ Clic "Cargar más"
│  ├─ /load-details carga 20 IDs → 19 tienen contacto
│  └─ results_shown: 33 → 52 ✅
│
└─ Clic "Cargar más"
   ├─ Solo quedan 8 resultados (60 - 52)
   ├─ /load-details carga 20 IDs → solo devuelve 8
   └─ results_shown: 52 → 60 ✅ (LÍMITE ALCANZADO)
```

---

### **Activar Plan Premium**

**Manual (Administrador)**:
1. Usuario contacta por WhatsApp y paga
2. Ir a Supabase Dashboard → Table Editor → `user_profiles`
3. Buscar usuario por email
4. Editar registro:
   ```sql
   plan: 'paid'
   total_results_limit: 1000  -- o el límite acordado
   ```
5. Usuario puede seguir usando la app inmediatamente

**Futuro (Automatizado)**:
- Integrar pasarela de pago (Stripe, Mercado Pago)
- Webhook que actualice la base de datos automáticamente

---

## 📥 Exportación de Datos

### **Flujo de Exportación a Excel**

```mermaid
sequenceDiagram
    participant U as Usuario
    participant F as Frontend
    participant B as Backend
    participant DB as Supabase
    participant X as Librería XLSX
    
    U->>F: Clic "Descargar Excel"
    F->>B: GET /history<br/>Authorization: Bearer TOKEN
    B->>DB: SELECT * FROM search_history<br/>WHERE user_id = current_user<br/>ORDER BY searched_at DESC
    DB-->>B: [...todos los registros...]
    B-->>F: {history: [...]}
    
    F->>X: json_to_sheet(history)
    X-->>F: worksheet
    
    F->>X: book_new() + book_append_sheet()
    X-->>F: workbook
    
    F->>X: writeFile(workbook, "prospectai_historial_2024-11-22.xlsx")
    X-->>U: Descarga archivo .xlsx
```

---

### **Código de Exportación (Frontend)**

```javascript
import * as XLSX from 'xlsx';

const handleExportToExcel = async () => {
  setLoading(true);
  
  try {
    // 1. Obtener todo el historial
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch(`${API_URL}/history`, {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`
      }
    });

    const data = await response.json();

    if (!data.history || data.history.length === 0) {
      setError('No tienes resultados guardados para exportar');
      return;
    }

    // 2. Mapear datos al formato de Excel
    const excelData = data.history.map(place => ({
      'Negocio': place.place_name,
      'Dirección': place.address || '',
      'Teléfono': place.phone || place.international_phone || '',
      'Sitio Web': place.website || '',
      'Valoración': place.rating || '',
      'Total Reseñas': place.user_ratings_total || '',
      'Google Maps URL': place.maps_url || '',
      'Búsqueda': place.query,
      'Ciudad': place.city,
      'País': place.country,
      'Fecha': new Date(place.searched_at).toLocaleDateString()
    }));

    // 3. Crear hoja de Excel
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Historial');

    // 4. Ajustar ancho de columnas
    const columnWidths = [
      { wch: 30 }, // Negocio
      { wch: 40 }, // Dirección
      { wch: 20 }, // Teléfono
      { wch: 35 }, // Sitio Web
      { wch: 10 }, // Valoración
      { wch: 15 }, // Total Reseñas
      { wch: 50 }, // Google Maps URL
      { wch: 25 }, // Búsqueda
      { wch: 20 }, // Ciudad
      { wch: 15 }, // País
      { wch: 12 }  // Fecha
    ];
    worksheet['!cols'] = columnWidths;

    // 5. Descargar archivo
    const fileName = `prospectai_historial_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    console.log(`Exportados ${excelData.length} lugares a Excel`);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

---

### **Estructura del Excel Generado**

| Negocio | Dirección | Teléfono | Sitio Web | Valoración | Total Reseñas | Google Maps URL | Búsqueda | Ciudad | País | Fecha |
|---------|-----------|----------|-----------|------------|---------------|-----------------|----------|--------|------|-------|
| Restaurante El Cielo | Calle 10 #38-26 | +57 4 311 2399 | https://elcielo.com.co | 4.6 | 1234 | https://maps.google.com/?cid=123 | restaurantes | Medellín | Colombia | 22/11/2024 |
| Hotel Dann Carlton | Carrera 43A #7-50 | +57 4 444 5151 | https://danncarlton.com | 4.5 | 890 | https://maps.google.com/?cid=456 | hoteles | Medellín | Colombia | 22/11/2024 |

---

## 💬 Integración con WhatsApp

### **Funcionalidad**

Cada resultado con teléfono incluye un botón de WhatsApp que:
1. Formatea el número de teléfono internacional
2. Abre WhatsApp Web/App con mensaje pre-escrito
3. Permite contactar directamente al negocio

---

### **Código de Formateo**

```javascript
const formatWhatsAppNumber = (phone) => {
  if (!phone) return null;
  
  // Remover caracteres no numéricos (excepto +)
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Si no tiene +, agregar prefijo internacional
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned; // Ejemplo: "+573001234567"
};

const openWhatsApp = (phone, businessName) => {
  const formattedNumber = formatWhatsAppNumber(phone);
  if (!formattedNumber) return;
  
  const message = encodeURIComponent(
    `Hola! Vi tu negocio ${businessName} y me gustaría conversar.`
  );
  
  const whatsappUrl = `https://wa.me/${formattedNumber.replace('+', '')}?text=${message}`;
  
  window.open(whatsappUrl, '_blank');
};
```

---

### **Interfaz**

```jsx
<td className="phone-cell">
  {place.phone || place.international_phone ? (
    <div className="phone-with-whatsapp">
      <span className="phone-number">
        {place.phone || place.international_phone}
      </span>
      <button 
        className="whatsapp-button"
        onClick={() => openWhatsApp(
          place.phone || place.international_phone, 
          place.name
        )}
        title="Abrir en WhatsApp"
      >
        {/* Icono de WhatsApp SVG */}
      </button>
    </div>
  ) : '—'}
</td>
```

---

### **URL Generada**

```
https://wa.me/573001234567?text=Hola!%20Vi%20tu%20negocio%20Restaurante%20El%20Cielo%20y%20me%20gustar%C3%ADa%20conversar.
```

**Comportamiento**:
- **Desktop**: Abre WhatsApp Web
- **Mobile**: Abre WhatsApp App
- **Sin WhatsApp**: Ofrece descargar la app

---

## 🔒 Seguridad

### **Autenticación JWT**

- **Generado por**: Supabase Auth
- **Almacenado**: `localStorage` (gestionado por Supabase)
- **Duración**: 1 hora (renovación automática)
- **Validación**: En cada request al backend mediante `authMiddleware`

---

### **Row Level Security (RLS)**

Todas las tablas tienen RLS activado:

```sql
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo pueden ver/modificar sus propios datos
CREATE POLICY "Users can view own profile" 
  ON user_profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can view own search history" 
  ON search_history FOR SELECT 
  USING (auth.uid() = user_id);
```

**Ventajas**:
- Seguridad a nivel de base de datos (no depende del backend)
- Imposible acceder a datos de otros usuarios, incluso con SQL injection
- Auditoría automática en Supabase logs

---

### **API Keys**

| Clave | Ubicación | Exposición | Uso |
|-------|-----------|------------|-----|
| `PLACES_API_KEY` | Backend `.env` | ❌ Privada | Google Places API |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend `.env` | ❌ Privada | Bypass RLS para admin |
| `VITE_SUPABASE_ANON_KEY` | Frontend `.env` | ✅ Pública | Supabase Auth (segura con RLS) |
| `VITE_SUPABASE_URL` | Frontend `.env` | ✅ Pública | URL del proyecto |

---

### **CORS**

Backend configurado para aceptar requests solo desde dominios autorizados:

```javascript
app.use(cors({
  origin: [
    'http://localhost:5173',           // Desarrollo
    'https://tu-app.netlify.app'       // Producción
  ],
  credentials: true
}));
```

---

### **Validaciones**

**Backend**:
- ✅ Token JWT en cada endpoint protegido
- ✅ Límites de usuario antes de ejecutar búsquedas
- ✅ Filtrado de lugares ya vistos (evitar cobrar dos veces)
- ✅ Validación de inputs (query, city, country)

**Frontend**:
- ✅ Redirección a login si no hay sesión
- ✅ Mostrar límites restantes en UI
- ✅ Deshabilitar botones si límite alcanzado
- ✅ Sanitización de inputs

---

## 🌍 Variables de Entorno

### **Frontend (`.env`)**

```bash
# Supabase
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend API
VITE_API_URL=http://localhost:3000                  # Desarrollo
# VITE_API_URL=https://tu-backend.railway.app       # Producción
```

---

### **Backend (`.env`)**

```bash
# Google Places API
PLACES_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Supabase
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Server
PORT=3000
```

---

## 📊 Resumen de Flujos

### **Flujo Completo de Usuario**

1. **Registro**:
   - Usuario ingresa email/password → Supabase crea cuenta
   - Trigger automático crea perfil (plan free, límite 60)

2. **Login**:
   - Usuario ingresa credenciales → Supabase valida
   - Frontend obtiene perfil y muestra límites restantes

3. **Búsqueda**:
   - Usuario ingresa query + ciudad + país
   - Backend divide ciudad en 100 grids
   - Ejecuta 100-300 búsquedas en Google Places (Text Search)
   - Consolida 1,500-3,000 IDs únicos
   - Filtra lugares ya vistos en historial
   - Aplica límite del usuario (free: 60)
   - Devuelve IDs disponibles

4. **Carga de Resultados**:
   - Frontend carga primeros 20 IDs automáticamente
   - Backend obtiene detalles de cada lugar (Place Details API)
   - Filtra lugares sin teléfono Y sin website
   - Guarda en historial (~15-18 lugares con contacto)
   - Actualiza contador `results_shown`
   - Devuelve lugares al frontend

5. **Cargar Más**:
   - Usuario hace clic "Cargar más"
   - Se repite flujo de carga (paso 4) hasta agotar IDs o límite

6. **Exportar**:
   - Usuario hace clic "Descargar Excel"
   - Frontend obtiene historial completo del backend
   - Convierte a XLSX y descarga archivo

7. **Contactar**:
   - Usuario hace clic en botón WhatsApp
   - Se abre WhatsApp con mensaje pre-escrito

---

### **Conteo de API Calls (Ejemplo: "Restaurantes Medellín")**

| API | Calls por Búsqueda | Costo (estimado) |
|-----|-------------------|------------------|
| **Geocoding** | 1 | $0.005 |
| **Text Search** | 100-300 (grids × páginas) | $15-$45 |
| **Place Details** | 20-60 (batch loads) | $3.40-$10.20 |
| **TOTAL** | 121-361 | $18.40-$55.20 |

**Optimizaciones**:
- Solo cargar detalles de lugares que el usuario verá
- Cachear bounds de ciudades en una tabla
- Reutilizar búsquedas entre usuarios (futura feature)

---

## 🚀 Próximos Pasos

### **Mejoras Sugeridas**

1. **Caché de Búsquedas**:
   - Guardar resultados de Text Search en tabla `cached_searches`
   - Reutilizar entre usuarios para misma query + ciudad
   - Reducir costos de API drasticamente

2. **Paginación de Resultados**:
   - Implementar paginación real en frontend (tabla infinita)
   - Cargar solo 20 resultados a la vez bajo demanda

3. **Filtros Avanzados**:
   - Filtrar por rating mínimo
   - Filtrar por número de reseñas
   - Solo negocios con website / solo con teléfono

4. **Automatización de Pagos**:
   - Integrar Stripe/Mercado Pago
   - Webhook para activar plan premium automáticamente

5. **Dashboard de Admin**:
   - Ver usuarios registrados
   - Activar/desactivar planes
   - Ver estadísticas de uso

6. **Notificaciones**:
   - Email cuando el usuario esté cerca del límite
   - Email cuando se active plan premium

---

## 📝 Conclusión

ProspectAI es una aplicación SaaS completa que combina:
- ✅ Autenticación robusta con Supabase
- ✅ Búsquedas inteligentes con sistema de grids
- ✅ Sistema de planes con límites (free/paid)
- ✅ Filtrado automático de duplicados
- ✅ Exportación masiva a Excel
- ✅ Integración directa con WhatsApp
- ✅ Seguridad a nivel de base de datos (RLS)
- ✅ Carga bajo demanda para optimizar costos

La arquitectura está diseñada para escalar y permitir agregar nuevas funcionalidades fácilmente.
