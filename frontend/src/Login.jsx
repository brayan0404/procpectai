import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Manejar confirmación de email
  useEffect(() => {
    // Verificar si hay un hash de confirmación en la URL
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        console.log('Usuario autenticado:', session.user);
        navigate('/');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // Login
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        console.log('Login exitoso:', data);
        navigate('/');
      } else {
        // Register
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`
          }
        });
        
        if (error) throw error;
        
        console.log('Registro exitoso:', data);
        alert('¡Cuenta creada! Revisa tu email para confirmar tu cuenta y podrás iniciar sesión.');
        setEmail('');
        setPassword('');
      }
    } catch (error) {
      console.error('Error de autenticación:', error);
      setError(error.message || 'Error al autenticar. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        {/* Lado izquierdo - Información */}
        <div className="login-left">
          <h2>Bienvenido a ProspectAI</h2>
          <p>
            Encuentra clientes potenciales para tu negocio. 
            Empieza gratis hoy mismo.
          </p>
          
          <div className="plan-box">
            <h3>Plan Gratis</h3>
            <ul>
              <li>60 resultados completamente gratis</li>
              <li>Exportar a Excel</li>
              <li>Sin tarjeta de crédito requerida</li>
            </ul>
          </div>

          <div className="plan-box">
            <h3>Plan Premium</h3>
            <ul>
              <li>1000+ resultados desde $60 USD</li>
              <li>Soporte prioritario</li>
              <li>Actualizaciones constantes</li>
            </ul>
            
            <a 
              href="https://wa.me/573003501654?text=Hola!%20Quiero%20información%20sobre%20el%20plan%20premium%20de%20ProspectAI" 
              target="_blank" 
              rel="noopener noreferrer"
              className="whatsapp-contact"
            >
              <svg className="whatsapp-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Contactar para activar Premium
            </a>
          </div>
        </div>

        {/* Lado derecho - Formulario */}
        <div className="login-right">
          <h1>ProspectAI</h1>
          <p className="login-subtitle">
            {isLogin ? 'Inicia sesión para continuar' : 'Crea tu cuenta gratis'}
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ 
                padding: '10px', 
                marginBottom: '15px', 
                backgroundColor: '#fee', 
                color: '#c00', 
                borderRadius: '5px',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            <div className="input-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tu@email.com"
                disabled={loading}
              />
            </div>

            <div className="input-group">
              <label>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
                disabled={loading}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Procesando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse')}
            </button>
          </form>

          <p className="toggle-auth">
            {isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="link-button"
            >
              {isLogin ? 'Regístrate gratis' : 'Inicia sesión'}
            </button>
          </p>

          <div className="plan-info"></div>
        </div>
      </div>
    </div>
  );
}
