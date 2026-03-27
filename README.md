# MIDP BIM Platform

**Master Information Delivery Plan** — Plataforma web colaborativa para gestión de entregables BIM bajo estándares **ISO 19650-1/2** y la **Guía Nacional BIM Perú**.

---

## Características principales

| Módulo | Funcionalidad |
|---|---|
| **Metamodelo dinámico** | Admin configura campos de codificación sin tocar código fuente |
| **Código auto-generado** | Se construye en tiempo real desde los valores de los campos |
| **Validación de duplicados** | Frontend + backend con feedback inmediato |
| **Importación Excel** | Plantilla dinámica + validación fila por fila + reporte de errores |
| **Exportación** | Excel, CSV, JSON con estructura completa |
| **Control de avance** | Unidades planificadas vs. consumidas por entregable |
| **Dashboard** | KPIs, distribución por estado, avance por disciplina |
| **Trazabilidad** | Historial de versiones completo + log de auditoría |
| **Gestión de usuarios** | CRUD exclusivo del admin, roles diferenciados |
| **Seguridad** | JWT, bcrypt, rate limiting, helmet, CORS estricto |

---

## Stack tecnológico

```
Frontend   Next.js 14 · React 18 · Tailwind CSS · TanStack Query · Zustand · Recharts
Backend    Node.js 20 · Express 5 · JWT · bcrypt · multer · xlsx · pdfmake
Database   PostgreSQL 16 · JSONB para campos dinámicos · UUID · pgcrypto
DevOps     Docker · docker-compose · multi-stage builds
```

---

## Instalación rápida

### Prerequisitos

- Docker ≥ 24.x
- Docker Compose ≥ 2.x
- Git

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU_ORG/bim-midp.git
cd bim-midp
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Edite .env con sus valores de producción
nano .env
```

Variables mínimas a cambiar en producción:
- `POSTGRES_PASSWORD` — contraseña de BD (fuerte)
- `JWT_SECRET` — secreto JWT (256 bits, aleatorio)
- `FRONTEND_URL` — URL pública del frontend

### 3. Levantar con Docker Compose

```bash
docker compose up -d
```

La primera vez el contenedor de PostgreSQL ejecuta automáticamente la migración `001_initial_schema.sql`, que:
- Crea todas las tablas y tipos
- Crea el usuario admin por defecto
- Crea el proyecto Hospital Trujillo de demo
- Carga 7 campos de codificación de ejemplo

### 4. Acceder a la plataforma

| URL | Descripción |
|---|---|
| `http://localhost:3000` | Frontend web |
| `http://localhost:4000/health` | Health check del backend |
| `http://localhost:5432` | PostgreSQL (solo red interna) |

**Credenciales de demo:**
```
Email:     admin@midp.bim
Password:  Admin@2025
```

> ⚠️ Cambie la contraseña en su primer acceso via Perfil → Cambiar contraseña.

---

## Estructura del repositorio

```
bim-midp/
├── frontend/                     # Next.js app
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/
│   │   │   │   └── FieldSchemaManager.jsx    # Configurador de campos
│   │   │   ├── deliverables/
│   │   │   │   └── DeliverableForm.jsx       # Formulario dinámico
│   │   │   ├── shared/
│   │   │   │   └── index.jsx                 # Badges, modals, etc.
│   │   │   └── Layout.jsx                    # Sidebar + top bar
│   │   ├── hooks/
│   │   │   └── useAuth.js                    # Zustand stores
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   │   ├── schemas.jsx               # Panel de campos
│   │   │   │   ├── users.jsx                 # Gestión de usuarios
│   │   │   │   └── projects.jsx              # Gestión de proyectos
│   │   │   ├── deliverables/
│   │   │   │   ├── index.jsx                 # Lista de entregables
│   │   │   │   └── [id].jsx                  # Detalle + historial
│   │   │   ├── dashboard.jsx
│   │   │   ├── import.jsx
│   │   │   ├── export.jsx
│   │   │   ├── audit.jsx
│   │   │   └── login.jsx
│   │   ├── utils/
│   │   │   └── api.js                        # Cliente Axios + endpoints
│   │   └── styles/
│   │       └── globals.css                   # Design tokens + utilidades
│   ├── Dockerfile
│   └── package.json
│
├── backend/                      # Express API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js                       # Login, me, change-password
│   │   │   ├── users.js                      # CRUD usuarios (admin)
│   │   │   ├── projects.js                   # CRUD proyectos
│   │   │   ├── fieldSchemas.js               # CRUD metamodelo
│   │   │   ├── deliverables.js               # CRUD entregables + validate-code
│   │   │   ├── production.js                 # Unidades productivas
│   │   │   ├── import.js                     # Excel import + template
│   │   │   ├── export.js                     # Excel, CSV, JSON export
│   │   │   ├── dashboard.js                  # KPIs y estadísticas
│   │   │   └── audit.js                      # Log de auditoría
│   │   ├── services/
│   │   │   ├── fieldSchemaService.js         # Metamodelo: build/validate code
│   │   │   └── auditService.js               # Escritura y consulta de logs
│   │   ├── middleware/
│   │   │   ├── auth.js                       # JWT + authorize()
│   │   │   └── errorHandler.js               # Error centralizado
│   │   └── utils/
│   │       ├── db.js                         # Pool PostgreSQL + transaction()
│   │       └── logger.js                     # Winston
│   ├── Dockerfile
│   └── package.json
│
├── database/
│   └── migrations/
│       └── 001_initial_schema.sql            # Schema completo + seeds
│
├── docs/
│   ├── api-endpoints.md                      # Referencia de endpoints
│   ├── architecture.md                       # Diagrama de arquitectura
│   └── excel-format.md                       # Formato del Excel de importación
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API Endpoints

### Autenticación
| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| POST | `/api/auth/login` | Iniciar sesión | Público |
| GET | `/api/auth/me` | Usuario autenticado | Todos |
| POST | `/api/auth/change-password` | Cambiar contraseña | Todos |

### Proyectos
| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| GET | `/api/projects` | Listar proyectos | Todos |
| POST | `/api/projects` | Crear proyecto | Admin |
| PUT | `/api/projects/:id` | Actualizar | Admin |

### Schemas (Metamodelo)
| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| GET | `/api/schemas/:projectId` | Listar campos | Todos |
| POST | `/api/schemas/:projectId` | Crear campo | Admin |
| PUT | `/api/schemas/:projectId/:id` | Actualizar | Admin |
| DELETE | `/api/schemas/:projectId/:id` | Eliminar | Admin |
| POST | `/api/schemas/:projectId/reorder` | Reordenar | Admin |

### Entregables
| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| GET | `/api/deliverables/:projectId` | Listar (paginado, filtros) | Todos |
| GET | `/api/deliverables/:projectId/:id` | Detalle + versiones | Todos |
| POST | `/api/deliverables/:projectId` | Crear | Manager+ |
| PUT | `/api/deliverables/:projectId/:id` | Actualizar | Manager+ |
| DELETE | `/api/deliverables/:projectId/:id` | Eliminar (soft) | Manager+ |
| POST | `/api/deliverables/:projectId/validate-code` | Verificar duplicado | Todos |

### Importación / Exportación
| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| GET | `/api/import/:projectId/template` | Descargar plantilla Excel | Todos |
| POST | `/api/import/:projectId` | Importar Excel | Manager+ |
| GET | `/api/export/:projectId/excel` | Exportar xlsx | Todos |
| GET | `/api/export/:projectId/csv` | Exportar csv | Todos |
| GET | `/api/export/:projectId/json` | Exportar json | Todos |

### Dashboard y Auditoría
| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| GET | `/api/dashboard/:projectId` | KPIs y estadísticas | Todos |
| GET | `/api/audit/:projectId` | Log de auditoría | Todos |

---

## Modelo de datos — Diagrama entidad-relación

```
projects ──────────────────────────────────────────────────────────────────
    │                                                                       │
    │ 1:N                                                                   │ 1:N
    ▼                                                                       ▼
field_schemas (metamodelo)                                           deliverables
    key        VARCHAR UNIQUE                                            code           VARCHAR (generado)
    field_type ENUM                                                     field_values   JSONB
    allowed_values JSONB                                                version        SMALLINT
    code_order SMALLINT                                                     │
    is_part_of_code BOOL                                                    │ 1:N
                                                                            ▼
                                                              deliverable_versions (snapshots)
                                                                            │
                                                                            │ 1:N
                                                                            ▼
                                                              production_units (avance)

users ◄── project_members
      ◄── audit_logs
      ◄── import_batches
```

---

## Configuración de campos — Metamodelo

El sistema de campos dinámicos permite al administrador definir la estructura del código **sin tocar código fuente**.

### Ejemplo — Hospital Trujillo

| Orden | Campo | Clave | Tipo | Valores | Separador |
|---|---|---|---|---|---|
| 1 | Proyecto | `project` | texto | — | `-` |
| 2 | Disciplina | `discipline` | dropdown | ARQ, EST, HID… | `-` |
| 3 | Fase | `phase` | dropdown | EP, AP, PD, CO | `-` |
| 4 | Zona | `zone` | dropdown | Z00–Z05 | `-` |
| 5 | Nivel | `level` | dropdown | SS, PB, P1… | `-` |
| 6 | Tipo | `type` | dropdown | PL, MO, ES… | `-` |
| 7 | Número | `number` | texto | — | _(vacío)_ |

**Código resultante:** `HRDTRU-ARQ-PD-Z03-P2-PL-0042`

### Formato del Excel de importación

La fila 1 contiene los nombres de columnas (descargue la plantilla desde la plataforma):

```
Proyecto * | Disciplina * | Fase * | Zona * | Nivel | Tipo * | Número * | Nombre del Entregable * | Estado | Fecha Planificada
HRDTRU     | ARQ          | PD     | Z03    | P2    | PL     | 0042    | Plano Arquitectura Quirófano | pending | 2025-08-01
```

---

## Roles y permisos

| Acción | Admin | BIM Manager | Especialista |
|---|---|---|---|
| Crear usuarios | ✅ | ❌ | ❌ |
| Configurar campos | ✅ | ❌ | ❌ |
| Crear proyectos | ✅ | ❌ | ❌ |
| Crear/editar entregables | ✅ | ✅ | ❌ |
| Importar Excel | ✅ | ✅ | ❌ |
| Ver entregables | ✅ | ✅ | ✅ |
| Exportar datos | ✅ | ✅ | ✅ |
| Ver auditoría | ✅ | ✅ | ✅ |
| Registrar avance | ✅ | ✅ | ✅ |

---

## Seguridad

- **Autenticación:** JWT (HS256), expiry configurable (default 8h)
- **Contraseñas:** bcrypt cost factor 12
- **Rate limiting:** 300 req/15min global, 10 req/15min en login
- **Headers:** helmet (CSP, HSTS, X-Frame, etc.)
- **CORS:** origin estricto por variable de entorno
- **Soft delete:** ningún dato se elimina físicamente de la BD
- **Audit log:** cada mutación queda registrada con usuario, IP y timestamp

---

## Desarrollo local (sin Docker)

```bash
# Backend
cd backend
npm install
# Copie .env.example a .env y ajuste DATABASE_URL
npm run dev        # nodemon en :4000

# Frontend
cd frontend
npm install
# Copie .env.example a .env y ajuste NEXT_PUBLIC_API_URL
npm run dev        # Next.js en :3000
```

---

## Licencia

MIT © 2025 — Proyecto MIDP BIM Platform

---

*Desarrollado para el proyecto Hospital Regional Docente de Trujillo (Nivel III-1), Consorcio SDD — bajo ISO 19650-1/2 y Guía Nacional BIM Perú.*
