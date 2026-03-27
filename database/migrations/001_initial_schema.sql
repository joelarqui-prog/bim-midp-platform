-- =============================================================================
-- MIDP BIM Platform - Database Schema
-- ISO 19650 compliant Master Information Delivery Plan
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'bim_manager', 'specialist');
CREATE TYPE deliverable_status AS ENUM (
  'pending', 'in_progress', 'for_review', 'approved', 'rejected', 'issued'
);
CREATE TYPE field_type AS ENUM ('text', 'dropdown', 'number', 'date', 'boolean');
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'import', 'status_change');

-- =============================================================================
-- PROJECTS
-- =============================================================================

CREATE TABLE projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  client        VARCHAR(255),
  location      VARCHAR(255),
  start_date    DATE,
  end_date      DATE,
  is_active     BOOLEAN DEFAULT TRUE,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- USERS
-- =============================================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  phone           VARCHAR(50),
  specialty       VARCHAR(255),
  company         VARCHAR(255),
  role            user_role NOT NULL DEFAULT 'specialist',
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Project-User assignments
CREATE TABLE project_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        user_role NOT NULL DEFAULT 'specialist',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- =============================================================================
-- DYNAMIC FIELD SCHEMA (METAMODEL)
-- =============================================================================
-- This is the core of the configurable coding system.
-- Each row defines ONE segment of the deliverable code.

CREATE TABLE field_schemas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,         -- e.g. "Disciplina"
  key             VARCHAR(50) NOT NULL,           -- e.g. "discipline" (snake_case, unique per project)
  field_type      field_type NOT NULL DEFAULT 'dropdown',
  is_required     BOOLEAN DEFAULT TRUE,
  is_part_of_code BOOLEAN DEFAULT TRUE,           -- included in auto-generated code?
  code_order      SMALLINT,                       -- position in code (1=first segment)
  separator       VARCHAR(5) DEFAULT '-',         -- separator AFTER this segment
  max_length      SMALLINT DEFAULT 10,
  allowed_values  JSONB DEFAULT NULL,             -- [{value, label, color?}] for dropdowns
  validation_regex VARCHAR(255) DEFAULT NULL,
  description     TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, key)
);

-- =============================================================================
-- DELIVERABLES
-- =============================================================================

CREATE TABLE deliverables (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code            VARCHAR(255) NOT NULL,          -- auto-generated from field_values
  name            VARCHAR(500) NOT NULL,
  description     TEXT,
  status          deliverable_status NOT NULL DEFAULT 'pending',
  assigned_to     UUID REFERENCES users(id),
  planned_date    DATE,
  actual_date     DATE,
  version         SMALLINT NOT NULL DEFAULT 1,
  field_values    JSONB NOT NULL DEFAULT '{}',    -- {discipline:"ARQ", phase:"D", zone:"Z01",...}
  metadata        JSONB DEFAULT '{}',
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID NOT NULL REFERENCES users(id),
  updated_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, code)
);

-- Index for fast code lookups and field_values queries
CREATE INDEX idx_deliverables_code ON deliverables(project_id, code);
CREATE INDEX idx_deliverables_status ON deliverables(project_id, status);
CREATE INDEX idx_deliverables_assigned ON deliverables(assigned_to);
CREATE INDEX idx_deliverables_field_values ON deliverables USING GIN (field_values);

-- =============================================================================
-- DELIVERABLE VERSIONS (SNAPSHOT)
-- =============================================================================

CREATE TABLE deliverable_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deliverable_id  UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  version         SMALLINT NOT NULL,
  snapshot        JSONB NOT NULL,                 -- full copy of deliverable at this version
  changed_by      UUID NOT NULL REFERENCES users(id),
  change_note     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PRODUCTION UNITS (AVANCE)
-- =============================================================================

CREATE TABLE production_units (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deliverable_id  UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  unit_type       VARCHAR(100) NOT NULL,          -- e.g. "Planos", "Modelos", "Documentos"
  planned_qty     DECIMAL(10,2) NOT NULL DEFAULT 0,
  consumed_qty    DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit_label      VARCHAR(50) DEFAULT 'und',
  notes           TEXT,
  recorded_by     UUID REFERENCES users(id),
  recorded_at     DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- AUDIT LOG
-- =============================================================================

CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id),
  action        audit_action NOT NULL,
  entity_type   VARCHAR(100) NOT NULL,            -- 'deliverable', 'user', 'field_schema', etc.
  entity_id     UUID,
  project_id    UUID REFERENCES projects(id),
  old_values    JSONB,
  new_values    JSONB,
  ip_address    INET,
  user_agent    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_project ON audit_logs(project_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- =============================================================================
-- IMPORT BATCHES
-- =============================================================================

CREATE TABLE import_batches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id),
  filename        VARCHAR(255) NOT NULL,
  total_rows      INTEGER DEFAULT 0,
  success_rows    INTEGER DEFAULT 0,
  error_rows      INTEGER DEFAULT 0,
  status          VARCHAR(50) DEFAULT 'pending',  -- pending, processing, done, failed
  errors          JSONB DEFAULT '[]',
  imported_by     UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- =============================================================================
-- TRIGGERS: updated_at auto-update
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_field_schemas_updated_at
  BEFORE UPDATE ON field_schemas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_deliverables_updated_at
  BEFORE UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_production_units_updated_at
  BEFORE UPDATE ON production_units FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- SEED: Default admin user (password: Admin@2025)
-- =============================================================================

INSERT INTO users (email, password_hash, full_name, role, specialty, company)
VALUES (
  'admin@midp.bim',
  crypt('Admin@2025', gen_salt('bf', 12)),
  'Administrador MIDP',
  'admin',
  'BIM Management',
  'Consorcio SDD'
);

-- =============================================================================
-- SEED: Hospital Trujillo demo project
-- =============================================================================

INSERT INTO projects (code, name, description, client, location, start_date, end_date)
VALUES (
  'HRDTRU-2025',
  'Hospital Regional Docente de Trujillo - Nivel III-1',
  'Proyecto de diseño BIM multidisciplinario bajo ISO 19650. RIBA Fases 2-4.',
  'PRONIS / Consorcio Salud Trujillo',
  'Trujillo, La Libertad, Perú',
  '2025-01-01',
  '2026-12-31'
);

-- =============================================================================
-- SEED: Default field schemas for Hospital Trujillo
-- =============================================================================

WITH proj AS (SELECT id FROM projects WHERE code = 'HRDTRU-2025' LIMIT 1),
     adm  AS (SELECT id FROM users WHERE email = 'admin@midp.bim' LIMIT 1)
INSERT INTO field_schemas
  (project_id, name, key, field_type, is_required, is_part_of_code, code_order, separator, max_length, allowed_values, description, created_by)
SELECT
  proj.id, name, key, field_type::field_type, is_required, is_part_of_code, code_order, separator, max_length, allowed_values::jsonb, description, adm.id
FROM proj, adm,
(VALUES
  ('Proyecto',    'project',    'text',     true,  true,  1, '-', 10, NULL,
   'Código del proyecto'),
  ('Disciplina',  'discipline', 'dropdown', true,  true,  2, '-', 5,
   '[{"value":"ARQ","label":"Arquitectura"},{"value":"EST","label":"Estructuras"},{"value":"HID","label":"Hidráulica"},{"value":"SAN","label":"Sanitarias"},{"value":"ELE","label":"Eléctricas"},{"value":"MEC","label":"Mecánicas"},{"value":"EQM","label":"Equipamiento Médico"},{"value":"COO","label":"Coordinación BIM"}]',
   'Especialidad o disciplina'),
  ('Fase',        'phase',      'dropdown', true,  true,  3, '-', 5,
   '[{"value":"EP","label":"Estudios Previos"},{"value":"AP","label":"Anteproyecto"},{"value":"PD","label":"Proyecto de Detalle"},{"value":"CO","label":"Construcción"}]',
   'Fase RIBA del entregable'),
  ('Zona',        'zone',       'dropdown', true,  true,  4, '-', 5,
   '[{"value":"Z00","label":"General"},{"value":"Z01","label":"Bloque A - Urgencias"},{"value":"Z02","label":"Bloque B - Hospitalización"},{"value":"Z03","label":"Bloque C - UCI/Quirófanos"},{"value":"Z04","label":"Bloque D - Diagnóstico"},{"value":"Z05","label":"Servicios Generales"}]',
   'Zona o bloque del proyecto'),
  ('Nivel',       'level',      'dropdown', false, true,  5, '-', 5,
   '[{"value":"SS","label":"Sótano"},{"value":"PB","label":"Planta Baja"},{"value":"P1","label":"Piso 1"},{"value":"P2","label":"Piso 2"},{"value":"P3","label":"Piso 3"},{"value":"AZ","label":"Azotea"},{"value":"GN","label":"General"}]',
   'Nivel o piso'),
  ('Tipo',        'type',       'dropdown', true,  true,  6, '-', 5,
   '[{"value":"PL","label":"Plano"},{"value":"MO","label":"Modelo BIM"},{"value":"ES","label":"Especificación"},{"value":"IN","label":"Informe"},{"value":"CR","label":"Cronograma"},{"value":"PR","label":"Presupuesto"},{"value":"DO","label":"Documento"}]',
   'Tipo de entregable'),
  ('Número',      'number',     'text',     true,  true,  7, '',  4, NULL,
   'Número correlativo (ej: 0001)')
) AS t(name, key, field_type, is_required, is_part_of_code, code_order, separator, max_length, allowed_values, description);
