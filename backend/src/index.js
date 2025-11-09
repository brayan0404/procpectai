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

        return {
          name: p.name,
          address: p.formatted_address,
          rating: p.rating,
          user_ratings_total: p.user_ratings_total,
          phone: p.formatted_phone_number || null,
          international_phone: p.international_phone_number || null,
          website: p.website || null,
          opening_hours: p.opening_hours?.weekday_text || null,
          price_level: p.price_level || null,
          types: p.types || [],
          lat: p.geometry.location.lat,
          lng: p.geometry.location.lng,
          maps_url: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
        };
      } catch (err) {
        console.error(`Error en detalles de place_id ${place.place_id}:`, err.response?.data || err.message);
        return null;
      }
    });

    const detailedPlaces = (await Promise.all(detailedPlacesPromises)).filter(p => p !== null);

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
