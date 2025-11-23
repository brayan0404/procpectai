-- =============================================
-- ACTUALIZACIÓN DE TABLA search_history
-- Ejecuta esto SOLO si ya creaste las tablas con el SQL anterior
-- =============================================

-- Si ya tienes la tabla search_history creada, agregar las nuevas columnas
ALTER TABLE public.search_history 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS international_phone TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS rating NUMERIC,
ADD COLUMN IF NOT EXISTS user_ratings_total INTEGER,
ADD COLUMN IF NOT EXISTS maps_url TEXT;

-- Remover la restricción CHECK del campo plan para permitir valores personalizados
ALTER TABLE public.user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_plan_check;

-- Verificar que las columnas se agregaron correctamente
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'search_history' 
ORDER BY ordinal_position;