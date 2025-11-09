import { useState } from 'react'
import './App.css'
import * as XLSX from 'xlsx'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [showLocationInputs, setShowLocationInputs] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextPageToken, setNextPageToken] = useState(null);
  const [showSearch, setShowSearch] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('');

  const loadingMessages = [
    'Buscando negocios...',
    'Analizando resultados...',
    'Recopilando información de contacto...',
    'Verificando datos...',
    'Organizando prospectos...',
    'Casi listo...'
  ];

  const handleSearch = async (pageToken = null) => {
    if (!query.trim()) {
      setError('Por favor ingresa un término de búsqueda');
      return;
    }

    if (city && !country) {
      setError('Si ingresas una ciudad, debes ingresar también el país');
      return;
    }

    setError('');
    setLoading(true);
    
    // Ciclo de mensajes de carga
    let messageIndex = 0;
    setLoadingMessage(loadingMessages[0]);
    const messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % loadingMessages.length;
      setLoadingMessage(loadingMessages[messageIndex]);
    }, 2000);

    try {
      let url = `${API_URL}/search?query=${encodeURIComponent(query)}`;
      if (city) url += `&city=${encodeURIComponent(city)}`;
      if (country) url += `&country=${encodeURIComponent(country)}`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error en la búsqueda');
      }

      if (pageToken) {
        setResults(prev => [...prev, ...data.results]);
      } else {
        setResults(data.results);
        if (data.results.length > 0) {
          setShowSearch(false);
        }
      }

      setNextPageToken(data.nextPageToken || null);

    } catch (err) {
      setError(err.message);
      if (!pageToken) setResults([]);
    } finally {
      clearInterval(messageInterval);
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const formatWhatsAppNumber = (phone) => {
    if (!phone) return null;
    // Remover todos los caracteres no numéricos excepto el +
    let cleaned = phone.replace(/[^\d+]/g, '');
    // Si no tiene +, agregar código de país por defecto (ajusta según necesites)
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  };

  const openWhatsApp = (phone, businessName) => {
    const formattedNumber = formatWhatsAppNumber(phone);
    if (!formattedNumber) return;
    
    const message = encodeURIComponent(`Hola! Vi tu negocio ${businessName} y me gustaría conversar.`);
    const whatsappUrl = `https://wa.me/${formattedNumber.replace('+', '')}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleExportToExcel = () => {
    // Preparar los datos para Excel
    const excelData = results.map(place => ({
      'Negocio': place.name,
      'Dirección': place.address || '',
      'Ciudad': place.city || '',
      'País': place.country || '',
      'Teléfono': place.phone || place.international_phone || '',
      'Sitio Web': place.website || '',
      'Valoración': place.rating || '',
      'Total Reseñas': place.user_ratings_total || '',
      'Latitud': place.lat || '',
      'Longitud': place.lng || '',
      'Google Maps URL': place.maps_url || ''
    }));

    // Crear el libro de Excel
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

    // Ajustar el ancho de las columnas
    const columnWidths = [
      { wch: 30 }, // Negocio
      { wch: 40 }, // Dirección
      { wch: 20 }, // Ciudad
      { wch: 15 }, // País
      { wch: 20 }, // Teléfono
      { wch: 35 }, // Sitio Web
      { wch: 10 }, // Valoración
      { wch: 15 }, // Total Reseñas
      { wch: 12 }, // Latitud
      { wch: 12 }, // Longitud
      { wch: 50 }  // Google Maps URL
    ];
    worksheet['!cols'] = columnWidths;

    // Descargar el archivo
    const fileName = `leads_${query}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="app">
      {showSearch && <div className="logo-corner">P</div>}
      <div className={`chat-container ${!showSearch && results.length > 0 ? 'has-results' : ''}`}>
        {showSearch && (
          <>
            <div className="chat-header">
              <h1>ProspectAI</h1>
              <p>Encuentra y conecta con tus próximos clientes</p>
            </div>

            <div className="chat-content">
              {error && (
                <div className="error">{error}</div>
              )}

              {loading && (
                <div className="loading-overlay">
                  <div className="loading-content">
                    <div className="loading-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <p className="loading-text">{loadingMessage}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="input-area">
              <div className="main-input-container">
                <input 
                  type="text" 
                  className="main-input" 
                  placeholder="¿Qué tipo de clientes buscas? Ej: restaurantes, hoteles, gimnasios..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
                <button 
                  className="send-button" 
                  onClick={() => handleSearch()}
                  disabled={loading}
                >
                  →
                </button>
              </div>
              
              <div className="location-section">
                {!showLocationInputs ? (
                  <button 
                    className="add-location-button"
                    onClick={() => setShowLocationInputs(true)}
                  >
                    + Agregar ubicación
                  </button>
                ) : (
                  <div className="location-inputs">
                    <input 
                      type="text" 
                      className="location-input" 
                      placeholder="País"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      onKeyPress={handleKeyPress}
                    />
                    <input 
                      type="text" 
                      className="location-input" 
                      placeholder="Ciudad"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      onKeyPress={handleKeyPress}
                    />
                    <button 
                      className="remove-location-button"
                      onClick={() => {
                        setShowLocationInputs(false);
                        setCity('');
                        setCountry('');
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {!showSearch && results.length > 0 && (
          <>
            <div className="layout-container">
              <div className="sidebar">
                <button 
                  className="new-search-icon-button-left"
                  onClick={() => setShowSearch(true)}
                  title="Nueva búsqueda"
                >
                  +
                </button>
              </div>

              <div className="main-content">
                <div className="results-header-bar">
                  <div className="header-title-section">
                    <h2 className="leads-title">Leads</h2>
                    <span className="results-count-small">{results.length} resultados</span>
                  </div>
                  <button 
                    className="export-excel-button"
                    onClick={handleExportToExcel}
                    title="Descargar Excel"
                  >
                    <svg className="excel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Descargar Excel
                  </button>
                </div>

                <div className="results-section">
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Negocio</th>
                      <th>Ubicación</th>
                      <th>Contacto</th>
                      <th>Sitio Web</th>
                      <th>Valoración</th>
                      <th>Horario</th>
                      <th>Maps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((place, index) => (
                      <tr key={index}>
                        <td className="name-cell">
                          <strong>{place.name}</strong>
                        </td>
                        <td className="address-cell">
                          <div className="address-content">
                            <div>{place.address || '—'}</div>
                            {place.lat && place.lng && (
                              <div className="coords">
                                {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="phone-cell">
                          {place.phone || place.international_phone ? (
                            <div className="phone-with-whatsapp">
                              <span className="phone-number">
                                {place.phone || place.international_phone}
                              </span>
                              <button 
                                className="whatsapp-button"
                                onClick={() => openWhatsApp(place.phone || place.international_phone, place.name)}
                                title="Abrir en WhatsApp"
                              >
                                <svg className="whatsapp-icon" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              </button>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="website-cell">
                          {place.website ? (
                            <a href={place.website} target="_blank" rel="noopener noreferrer" className="website-link">
                              {place.website}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="rating-cell">
                          {place.rating ? (
                            <div className="rating-content">
                              <div className="rating-value">★ {place.rating}</div>
                              {place.user_ratings_total && (
                                <div className="rating-count">{place.user_ratings_total.toLocaleString()} reseñas</div>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="hours-cell">
                          {place.opening_hours ? (
                            <details className="hours-details">
                              <summary>Ver horario</summary>
                              <div className="hours-dropdown">
                                {place.opening_hours.map((day, i) => (
                                  <div key={i} className="hour-item">{day}</div>
                                ))}
                              </div>
                            </details>
                          ) : '—'}
                        </td>
                        <td className="maps-cell">
                          <a href={place.maps_url} target="_blank" rel="noopener noreferrer" className="maps-link">
                            Ver Maps
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextPageToken && (
                <div className="load-more">
                  <button 
                    className="load-more-button"
                    onClick={() => handleSearch(nextPageToken)}
                    disabled={loading}
                  >
                    {loading ? 'Cargando más...' : 'Cargar más resultados'}
                  </button>
                </div>
              )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App
