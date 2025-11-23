-- =============================================
-- PROSPECTAI - CONFIGURACIÓN DE BASE DE DATOS
-- =============================================

-- 1. Crear tabla de perfiles de usuario (extiende auth.users)
CREATE TABLE public.user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  total_results_limit INTEGER NOT NULL DEFAULT 60,
  results_shown INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Crear tabla de historial de búsquedas
CREATE TABLE public.search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
  place_id TEXT NOT NULL,
  place_name TEXT,
  address TEXT,
  phone TEXT,
  international_phone TEXT,
  website TEXT,
  rating NUMERIC,
  user_ratings_total INTEGER,
  maps_url TEXT,
  query TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  searched_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Índices para mejorar performance
CREATE INDEX idx_search_history_user_id ON public.search_history(user_id);
CREATE INDEX idx_search_history_place_id ON public.search_history(user_id, place_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de seguridad para user_profiles
-- Los usuarios solo pueden ver su propio perfil
CREATE POLICY "Users can view own profile" 
  ON public.user_profiles FOR SELECT 
  USING (auth.uid() = id);

-- Los usuarios pueden actualizar su propio perfil (solo searches_used)
CREATE POLICY "Users can update own profile" 
  ON public.user_profiles FOR UPDATE 
  USING (auth.uid() = id);

-- 6. Políticas de seguridad para search_history
-- Los usuarios solo pueden ver su propio historial
CREATE POLICY "Users can view own search history" 
  ON public.search_history FOR SELECT 
  USING (auth.uid() = user_id);

-- Los usuarios pueden insertar en su propio historial
CREATE POLICY "Users can insert own search history" 
  ON public.search_history FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- 7. Función para crear perfil automáticamente cuando se registra un usuario
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, plan, total_results_limit, results_shown)
  VALUES (NEW.id, NEW.email, 'free', 60, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Trigger para ejecutar la función cuando se crea un usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Trigger para actualizar updated_at en user_profiles
CREATE TRIGGER on_user_profile_updated
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- SETUP COMPLETO
-- =============================================
-- Lógica de límites:
-- - Plan FREE: 60 resultados (lugares) en total
-- - Plan PAID: 1000+ resultados según pago
-- 
-- Flujo:
-- 1. Usuario hace búsqueda → encuentra N lugares con Text Search
-- 2. Backend filtra lugares ya mostrados (search_history)
-- 3. Backend filtra lugares sin phone Y sin website
-- 4. Backend verifica: results_shown + nuevos_resultados <= total_results_limit
-- 5. Si excede límite: devuelve solo los que falten para completar el límite
-- 6. Guarda nuevos lugares en search_history
-- 7. Incrementa results_shown
-- =============================================
