const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, '../.env') });
const axios = require("axios");
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const app = express();

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configurar CORS para permitir tu frontend en producción
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Headers adicionales para asegurar CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de autenticación
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No se proporcionó token de autenticación' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    // Obtener perfil del usuario
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Perfil de usuario no encontrado' });
    }

    req.user = user;
    req.userProfile = profile;
    next();
  } catch (err) {
    console.error('Error en autenticación:', err);
    return res.status(500).json({ error: 'Error al verificar autenticación' });
  }
}

// Endpoint para obtener bounds de una ciudad
app.get("/geocode", async (req, res) => {
  const { city, country } = req.query;

  if (!city || !country) {
    return res.status(400).json({ error: "Debes enviar city y country" });
  }

  try {
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          address: `${city}, ${country}`,
          key: process.env.PLACES_API_KEY
        }
      }
    );

    if (response.data.status !== "OK" || !response.data.results.length) {
      return res.status(404).json({ error: "Ciudad no encontrada" });
    }

    const result = response.data.results[0];
    res.json({
      bounds: result.geometry.bounds || result.geometry.viewport,
      location: result.geometry.location
    });
  } catch (err) {
    console.error("Error en geocoding:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Función para dividir bounds en grids
function createGrids(bounds, gridSize = 5) {
  const { northeast, southwest } = bounds;
  const latStep = (northeast.lat - southwest.lat) / gridSize;
  const lngStep = (northeast.lng - southwest.lng) / gridSize;
  
  const grids = [];
  
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const centerLat = southwest.lat + (i + 0.5) * latStep;
      const centerLng = southwest.lng + (j + 0.5) * lngStep;
      
      // Radio aproximado para cubrir el grid (diagonal / 2)
      const latDistance = latStep * 111000; // ~111km por grado de latitud
      const lngDistance = lngStep * 111000 * Math.cos(centerLat * Math.PI / 180);
      const radius = Math.sqrt(latDistance * latDistance + lngDistance * lngDistance) / 2;
      
      grids.push({
        center: { lat: centerLat, lng: centerLng },
        radius: Math.min(radius, 50000) // Máximo 50km permitido por Google
      });
    }
  }
  
  return grids;
}

app.get("/search", authMiddleware, async (req, res) => {
  const { query, city, country, pageToken } = req.query;
  const userProfile = req.userProfile;

  if (!query) {
    return res.status(400).json({ error: "Debes enviar query" });
  }

  // Verificar límite de resultados del usuario
  if (userProfile.results_shown >= userProfile.total_results_limit) {
    return res.status(403).json({ 
      error: `Has alcanzado tu límite de ${userProfile.total_results_limit} resultados. ${userProfile.plan === 'free' ? 'Contacta para actualizar a Plan Premium.' : ''}`,
      limit_reached: true
    });
  }

  // Validación de ubicación
  if (city && !country) {
    return res.status(400).json({ error: "Si envías ciudad, debes enviar también el país" });
  }

  let locationBias = "";
  if (city && country) locationBias = `${city}, ${country}`;
  else if (country) locationBias = country;

  try {
    let allPlaceIds = new Set();

    // Validar que se envíe ciudad y país (obligatorio para grids)
    if (!city || !country) {
      return res.status(400).json({ error: "Debes enviar city y country para búsqueda con grids" });
    }

    console.log(`Búsqueda con grids para: ${city}, ${country}`);
    
    // 1. Obtener bounds de la ciudad
    const geocodeResp = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          address: `${city}, ${country}`,
          key: process.env.PLACES_API_KEY
        }
      }
    );

    console.log("Geocoding status:", geocodeResp.data.status);
    console.log("Geocoding error message:", geocodeResp.data.error_message);
    console.log("Geocoding results:", geocodeResp.data.results?.length || 0);

    if (geocodeResp.data.status !== "OK" || !geocodeResp.data.results.length) {
      return res.status(404).json({ 
        error: "Ciudad no encontrada",
        geocodingStatus: geocodeResp.data.status,
        geocodingError: geocodeResp.data.error_message
      });
    }

    const bounds = geocodeResp.data.results[0].geometry.bounds || 
                   geocodeResp.data.results[0].geometry.viewport;
    
    // 2. Dividir en grids (10x10 = 100 búsquedas)
    const grids = createGrids(bounds, 10);
    console.log(`Ciudad dividida en ${grids.length} grids`);

    // 3. Buscar en cada grid (solo IDs) con paginación automática
    const gridSearchPromises = grids.map(async (grid, index) => {
      try {
        const gridPlaceIds = [];
        let pageToken = null;
        let pageCount = 0;
        const maxPages = 3; // Máximo 3 páginas por grid (20 * 3 = 60 resultados max)

        do {
          const textSearchBody = {
            textQuery: query,
            maxResultCount: 20,
            locationBias: {
              circle: {
                center: {
                  latitude: grid.center.lat,
                  longitude: grid.center.lng
                },
                radius: grid.radius
              }
            }
          };

          // Agregar pageToken solo si existe
          if (pageToken) {
            textSearchBody.pageToken = pageToken;
          }

          const response = await axios.post(
            "https://places.googleapis.com/v1/places:searchText",
            textSearchBody,
            {
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": process.env.PLACES_API_KEY,
                "X-Goog-FieldMask": "places.id,nextPageToken"
              }
            }
          );

          const placeIds = (response.data.places || []).map(p => p.id);
          gridPlaceIds.push(...placeIds);
          
          pageToken = response.data.nextPageToken;
          pageCount++;

          console.log(`Grid ${index + 1}, página ${pageCount}: ${placeIds.length} lugares (total grid: ${gridPlaceIds.length})`);
          
          if (gridPlaceIds.length > 0 && pageCount === 1) {
            console.log(`Ejemplo de ID del grid ${index + 1}:`, gridPlaceIds[0]);
          }

          // Detener si no hay más páginas o alcanzamos el límite
          if (!pageToken || pageCount >= maxPages) {
            break;
          }

        } while (pageToken);

        return gridPlaceIds;
      } catch (err) {
        console.error(`Error en grid ${index + 1}:`, err.response?.data || err.message);
        return [];
      }
    });

    // Ejecutar todas las búsquedas de grids en paralelo
    const gridResults = await Promise.all(gridSearchPromises);
    
    // 4. Consolidar IDs únicos
    gridResults.forEach(ids => {
      ids.forEach(id => allPlaceIds.add(id));
    });

    console.log(`Total de lugares únicos encontrados: ${allPlaceIds.size}`);

    // Convertir Set a Array
    const uniquePlaceIds = Array.from(allPlaceIds);

    // 5. Filtrar lugares que ya fueron mostrados al usuario
    const { data: searchHistory } = await supabase
      .from('search_history')
      .select('place_id')
      .eq('user_id', req.user.id);

    const shownPlaceIds = new Set(searchHistory?.map(h => h.place_id) || []);
    
    // Filtrar IDs nuevos (que no están en el historial)
    const newPlaceIds = uniquePlaceIds.filter(placeId => !shownPlaceIds.has(placeId));

    console.log(`   Lugares nuevos (no vistos antes): ${newPlaceIds.length}`);

    // 6. Verificar límite del usuario
    const remainingLimit = userProfile.total_results_limit - userProfile.results_shown;
    
    // 7. Limitar IDs según el límite del usuario
    const availablePlaceIds = newPlaceIds.slice(0, remainingLimit);

    console.log(`   Límite del usuario: ${remainingLimit} resultados restantes`);
    console.log(`   IDs disponibles para cargar: ${availablePlaceIds.length}`);

    // Devolver los IDs para que el frontend los cargue bajo demanda
    res.json({
      placeIds: availablePlaceIds,
      totalFound: uniquePlaceIds.length,
      newPlaces: newPlaceIds.length,
      availableToLoad: availablePlaceIds.length,
      remainingLimit: remainingLimit,
      userPlan: userProfile.plan
    });
  } catch (err) {
    console.error("Error al buscar lugares:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Nuevo endpoint para cargar detalles de lugares bajo demanda
app.post("/load-details", authMiddleware, async (req, res) => {
  const { placeIds } = req.body; // Array de IDs a cargar
  const userProfile = req.userProfile;

  if (!placeIds || !Array.isArray(placeIds) || placeIds.length === 0) {
    return res.status(400).json({ error: "Debes enviar un array de placeIds" });
  }

  // Verificar que el usuario no exceda su límite
  const remainingLimit = userProfile.total_results_limit - userProfile.results_shown;
  
  if (remainingLimit <= 0) {
    return res.status(403).json({ 
      error: `Has alcanzado tu límite de ${userProfile.total_results_limit} resultados.`,
      limit_reached: true
    });
  }

  // Limitar la cantidad de IDs a cargar según el límite restante
  const idsToLoad = placeIds.slice(0, Math.min(placeIds.length, remainingLimit));

  console.log(`Cargando detalles de ${idsToLoad.length} lugares para usuario ${req.user.email}`);

  try {
    // Cargar detalles de los lugares
    const detailedPlacesPromises = idsToLoad.map(async placeId => {
      try {
        // El ID ya viene en formato "places/ChIJ..." desde el Text Search
        // Si por alguna razón no tiene el prefijo, lo agregamos
        const formattedId = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
        const fullUrl = `https://places.googleapis.com/v1/${formattedId}`;
        
        const detailResp = await axios.get(
          fullUrl,
          {
            headers: {
              "X-Goog-Api-Key": process.env.PLACES_API_KEY,
              //Qui pido tambien international phone number, tengo que ver por que hago eso
              "X-Goog-FieldMask": "id,displayName,formattedAddress,rating,userRatingCount,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri"
            }
          }
        );

        const p = detailResp.data;
        
        // Validar que existan datos mínimos
        if (!p || !p.id) {
          console.error(`Place ${placeId} sin datos completos`);
          return null;
        }

        return {
          id: placeId,
          name: p.displayName?.text || "Sin nombre",
          address: p.formattedAddress || null,
          rating: p.rating || null,
          user_ratings_total: p.userRatingCount || null,
          phone: p.nationalPhoneNumber || null,
          international_phone: p.internationalPhoneNumber || null,
          website: p.websiteUri || null,
          maps_url: p.googleMapsUri || null
        };
      } catch (err) {
        console.error(`Error al cargar detalles de ${placeId}:`, err.response?.data || err.message);
        return null;
      }
    });

    const detailedPlaces = (await Promise.all(detailedPlacesPromises)).filter(p => p !== null);

    // Filtrar lugares sin phone Y sin website
    const placesWithContact = detailedPlaces.filter(p => p.phone || p.website);

    console.log(`${detailedPlaces.length} lugares cargados, ${placesWithContact.length} con contacto`);

    // Guardar en historial y actualizar contador
    if (placesWithContact.length > 0) {
      const historyRecords = placesWithContact.map(place => ({
        user_id: req.user.id,
        place_id: place.id,
        place_name: place.name,
        address: place.address,
        phone: place.phone,
        international_phone: place.international_phone,
        website: place.website,
        rating: place.rating,
        user_ratings_total: place.user_ratings_total,
        maps_url: place.maps_url,
        query: req.body.query || '',
        city: req.body.city || '',
        country: req.body.country || ''
      }));

      await supabase
        .from('search_history')
        .insert(historyRecords);

      // Actualizar results_shown
      await supabase
        .from('user_profiles')
        .update({ 
          results_shown: userProfile.results_shown + placesWithContact.length 
        })
        .eq('id', req.user.id);

      console.log(`Guardados ${placesWithContact.length} lugares en historial`);
    }

    const newRemainingLimit = remainingLimit - placesWithContact.length;

    res.json({
      places: placesWithContact,
      loaded: placesWithContact.length,
      newRemainingLimit: newRemainingLimit,
      limit_reached: newRemainingLimit <= 0
    });
  } catch (err) {
    console.error("Error al cargar detalles:", err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para obtener historial del usuario (para el CSV)
app.get("/history", authMiddleware, async (req, res) => {
  try {
    const { data: history, error } = await supabase
      .from('search_history')
      .select('*')
      .eq('user_id', req.user.id)
      .order('searched_at', { ascending: false });

    if (error) throw error;

    res.json({ history });
  } catch (err) {
    console.error("Error al obtener historial:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌍 CORS habilitado para todos los orígenes`);
  console.log(`📍 Supabase URL: ${process.env.SUPABASE_URL ? 'Configurada ✓' : 'NO CONFIGURADA ✗'}`);
  console.log(`🔑 API Key: ${process.env.PLACES_API_KEY ? 'Configurada ✓' : 'NO CONFIGURADA ✗'}`);
});
