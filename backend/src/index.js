const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, '../.env') });
const axios = require("axios");

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/search", async (req, res) => {
  const { query, city, country, pageToken } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Debes enviar query" });
  }

  // Validación de ubicación
  if (city && !country) {
    return res.status(400).json({ error: "Si envías ciudad, debes enviar también el país" });
  }

  let locationBias = "";
  if (city && country) locationBias = `${city}, ${country}`;
  else if (country) locationBias = country;

  try {
    const params = {
      query: query + (locationBias ? ` in ${locationBias}` : ""),
      key: process.env.PLACES_API_KEY
    };
    if (pageToken) params.pagetoken = pageToken;

    // Text Search
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/place/textsearch/json",
      { params }
    );

    const placesBasic = response.data.results;
    const nextPageToken = response.data.next_page_token || null;

    // Place Details sin fotos
    const detailedPlacesPromises = placesBasic.map(async place => {
      try {
        const detailResp = await axios.get(
          "https://maps.googleapis.com/maps/api/place/details/json",
          {
            params: {
              place_id: place.place_id,
              key: process.env.PLACES_API_KEY,
              fields: [
                "name",
                "formatted_address",
                "geometry",
                "rating",
                "user_ratings_total",
                "formatted_phone_number",
                "international_phone_number",
                "website",
                "opening_hours",
                "price_level",
                "types",
                "place_id"
              ].join(",")
            }
          }
        );

        const p = detailResp.data.result;
        
        // Validar que existan datos mínimos
        if (!p || !p.name) {
          console.error(`Place ${place.place_id} sin datos completos, usando datos básicos`);
          return {
            name: place.name,
            address: place.formatted_address || null,
            rating: place.rating || null,
            user_ratings_total: place.user_ratings_total || null,
            phone: null,
            international_phone: null,
            website: null,
            opening_hours: null,
            price_level: null,
            types: place.types || [],
            lat: place.geometry?.location?.lat || null,
            lng: place.geometry?.location?.lng || null,
            maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
          };
        }

        return {
          name: p.name,
          address: p.formatted_address || null,
          rating: p.rating || null,
          user_ratings_total: p.user_ratings_total || null,
          phone: p.formatted_phone_number || null,
          international_phone: p.international_phone_number || null,
          website: p.website || null,
          opening_hours: p.opening_hours?.weekday_text || null,
          price_level: p.price_level || null,
          types: p.types || [],
          lat: p.geometry?.location?.lat || null,
          lng: p.geometry?.location?.lng || null,
          maps_url: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
        };
      } catch (err) {
        console.error(`Error en detalles de place_id ${place.place_id}:`, err.response?.data || err.message);
        // Fallback a datos básicos si falla el detail
        return {
          name: place.name,
          address: place.formatted_address || null,
          rating: place.rating || null,
          user_ratings_total: place.user_ratings_total || null,
          phone: null,
          international_phone: null,
          website: null,
          opening_hours: null,
          price_level: null,
          types: place.types || [],
          lat: place.geometry?.location?.lat || null,
          lng: place.geometry?.location?.lng || null,
          maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
        };
      }
    });

    const detailedPlaces = (await Promise.all(detailedPlacesPromises)).filter(p => p !== null && p.name);

    res.json({
      results: detailedPlaces,
      nextPageToken
    });
  } catch (err) {
    console.error("Error al buscar lugares:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});





/*

Hola soy brayan fundador de prospectai. Las empresas que venden b2b y tienen a google maps como una 
herramienta para obtener leads pierden varias horas a la semana, por que es la bsuqeda y organizacion
de estos datos lo realizan de forma manual. Prospectai te permite buscar por tipo de negocio y en menos
de 10 segundos obtienes una lista con miles de posibles clientes.
*/