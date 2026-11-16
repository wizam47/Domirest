# DomiRest · Sabor & Punto

PWA de domicilios para presentar en vivo desde el celular. Incluye el flujo completo del cliente, el panel de comandas del restaurante y la app del domiciliario, con datos demo de Montería.

## Stack

- **Backend:** Flask, Flask-SQLAlchemy, SQLAlchemy y sesiones con cookies HTTP-only.
- **Facturas:** PDF A4 generado con `fpdf2` (sin dependencias del sistema) y número derivado del pedido, sin migraciones.
- **Base de datos:** SQLite por defecto (`backend/domirest.db`); MySQL u otra URL de SQLAlchemy mediante `DATABASE_URL`.
- **Frontend:** HTML, CSS y JavaScript vanilla con módulos ES. Sin frameworks ni build.
- **Mapas:** Leaflet local + OpenStreetMap, sin API key.
- **PWA:** manifest, service worker, iconos instalables, banner de instalación, compartir nativo y QR generado localmente.

## Arranque rápido

Requisitos: Python 3.11 o superior (probado con 3.14) y conexión para cargar las fotos de Unsplash y las fuentes de Google.

```powershell
python -m pip install -r backend\requirements.txt
python backend\seed.py
python backend\app.py
```

Abre `http://127.0.0.1:5000`.

También puedes ejecutar desde `backend`:

```powershell
cd backend
python -m pip install -r requirements.txt
python seed.py
python app.py
```

> `seed.py` reinicia la base y vuelve a cargar usuarios, productos, historial y comandas activas. Úsalo cuando quieras dejar la demo como nueva. Al arrancar la app, si la base está vacía se cargan los datos demo automáticamente sin borrar información existente.

## Demo desde el celular

1. Conecta el computador y el celular a la misma red Wi-Fi.
2. Ejecuta `ipconfig` y busca la IPv4 del computador.
3. Abre `http://TU-IP:5000` en el celular.

En Windows puede aparecer una alerta del firewall la primera vez; permite el acceso en redes privadas.

> La instalación como PWA y el service worker requieren **HTTPS** (o `localhost`). Para probar la instalación desde el celular usa Render o un túnel de Cloudflare como se explica más abajo.

## Usuarios demo

Contraseña para todos: `Demo1234`

| Rol | Correo |
| --- | --- |
| Cliente | `cliente@saborpunto.co` |
| Administrador | `admin@saborpunto.co` |
| Domiciliario | `domiciliario@saborpunto.co` |

La pantalla de acceso también tiene botones de entrada directa para cada rol. El perfil permite cambiar de rol sin cerrar sesión, ideal para la presentación.

## Qué se puede demostrar

- **Cliente:** bienvenida, onboarding, menú con búsqueda y filtros, favoritos, carrito, checkout, pago simulado, seguimiento en mapa, calificación y **factura en PDF** al pagar.
- **Administrador:** KPIs del día, ventas, gráfica por hora, pedidos recientes, comandas con drag-and-drop y CRUD de productos.
- **Domiciliario:** disponibilidad, entregas activas, detalle con mapa, avance de estado, confirmación de entrega e historial con ganancias.
- **PWA:** tema claro/oscuro, instalación en Android/iOS, shell offline, actualización del service worker, banner de instalación y compartir con enlace o QR.

## Instalar la PWA

### Android

1. Abre el enlace HTTPS de DomiRest en Chrome.
2. Toca el banner **Instalar** o abre el menú **⋮ → Instalar app**.
3. Confirma y abre DomiRest desde el inicio del teléfono.

### iPhone / iPad

1. Abre el enlace en **Safari** (en iOS la instalación no funciona desde Chrome).
2. Toca **Compartir** en la barra inferior.
3. Elige **Agregar a pantalla de inicio**.
4. Toca **Agregar** y abre DomiRest como una app.

El banner de instalación se oculta automáticamente si la app ya se abrió en modo standalone o si el sistema no permite el aviso. En iOS muestra la guía paso a paso. También puedes entrar a **Perfil → Instalar app** para abrir el instalador nativo o la guía.

## Compartir el enlace y el QR

En **Perfil → Compartir app** se usa el compartir nativo del celular. Si el navegador no lo soporta, se copia el enlace y se abre una hoja con el QR generado localmente, sin servicios externos. También puedes usar **Perfil → Código QR** para mostrar el QR directamente.

## Publicar en Render

La forma más rápida de tener un enlace HTTPS público es Render. El proyecto incluye `render.yaml` y `Procfile`.

### Opción A: Blueprint con `render.yaml`

1. Sube el proyecto a un repositorio de GitHub.
2. En Render entra a **New → Blueprint** y conecta el repositorio.
3. Render detecta `render.yaml`, instala las dependencias y ejecuta Gunicorn.
4. Espera el despliegue y abre la URL `https://TU-SERVICIO.onrender.com`.

### Opción B: Web Service manual

1. En Render entra a **New → Web Service** y conecta el repositorio.
2. Configura:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`
   - **Health Check Path:** `/api/health`
3. Agrega las variables:
   - `SECRET_KEY`: valor largo y aleatorio.
   - `FLASK_DEBUG`: `0`
   - `PRODUCTION`: `1`
   - `SESSION_COOKIE_SECURE`: `1`
4. Despliega y abre la URL HTTPS.

En el primer arranque, si la base está vacía, se cargan automáticamente los datos demo. El plan gratuito de Render **duerme el servicio** tras un periodo de inactividad; el primer acceso del día puede tardar entre **30 y 50 segundos** en despertar.

> El disco del plan gratuito es efímero: si Render reinicia o redespliega, SQLite vuelve a crearse y se auto-siembra. Para conservar datos usa un disco persistente (plan pago) o una base externa configurando `DATABASE_URL`.

### Comandos Git sugeridos

```powershell
git init
git add .
git commit -m "DomiRest PWA lista para demo"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/domirest.git
git push -u origin main
```

## Compartir con Cloudflare Tunnel

Si quieres enseñar la demo desde tu computador sin desplegar en Render:

1. Instala `cloudflared` (en Windows puedes usar `winget install --id Cloudflare.cloudflared`).
2. Arranca el servidor local:

   ```powershell
   python backend\app.py
   ```

3. En otra terminal crea el túnel temporal:

   ```powershell
   cloudflared tunnel --url http://localhost:5000
   ```

4. Copia la URL `https://algo-random.trycloudflare.com` que aparece en la consola y ábrela en el celular.

Mientras el túnel y el servidor estén corriendo, el enlace funciona y permite instalar la PWA porque Cloudflare entrega HTTPS. Si cierras la terminal, el enlace deja de responder.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `SECRET_KEY` | Clave de sesión de Flask. Cámbiala fuera de la demo. |
| `PORT` | Puerto del servidor (por defecto `5000`). |
| `HOST` | Interfaz de escucha (por defecto `0.0.0.0`). |
| `FLASK_DEBUG` | `1` activa el modo debug. |
| `PRODUCTION` | `1` activa modo producción y cookies seguras. |
| `SESSION_COOKIE_SECURE` | Fuerza cookies `Secure` (`1`) o las desactiva (`0`). En Render se activa sola. |
| `DATABASE_URL` | URL completa de SQLAlchemy. Tiene prioridad. |
| `DB_ENGINE` | `sqlite` (por defecto) o `mysql`. |
| `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE` | Conexión MySQL. |
| `DELIVERY_FEE`, `FREE_DELIVERY_FROM` | Domicilio y umbral de envío gratis. |

Las cookies seguras se activan automáticamente en Render y en modo producción, pero siguen funcionando en local por HTTP. Si usas una base PostgreSQL externa, agrega el driver correspondiente a `requirements.txt` y define `DATABASE_URL`.

### MySQL opcional

```powershell
$env:DB_ENGINE="mysql"
$env:MYSQL_USER="root"
$env:MYSQL_PASSWORD="tu_clave"
$env:MYSQL_DATABASE="domirest"
python backend\seed.py
python backend\app.py
```

## API principal

- `GET /api/health`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/me`
- `POST /api/auth/demo/<client|admin|courier>`
- `GET /api/categories`, `GET /api/products`, `GET /api/products?all=1`
- `GET /api/orders`, `POST /api/orders`, `GET /api/orders/:id`
- `GET /api/orders/:id/invoice` (datos para la vista previa)
- `GET /api/orders/:id/invoice.pdf` (PDF de la factura)
- `POST /api/orders/:id/status`, `POST /api/orders/:id/assign`
- `POST /api/orders/:id/rate`, `GET /api/orders/:id/repeat`
- `GET /api/admin/stats`, `GET /api/admin/orders`, `GET /api/admin/recent`, `GET /api/admin/couriers`
- `GET /api/courier/summary`
- CRUD de productos en `/api/products`

Los pedidos usan estados `recibido`, `preparando`, `listo`, `en_camino`, `entregado` y `cancelado`.

## Estructura

```text
Domirest/
├─ backend/
│  ├─ app.py              # fábrica Flask, auto-seed, headers PWA y servidor
│  ├─ config.py           # SQLite/MySQL, producción y cookies
│  ├─ invoices.py         # datos y PDF de la factura
│  ├─ models.py           # usuarios, menú y pedidos
│  ├─ seed.py             # datos demo y auto-siembra no destructiva
│  ├─ requirements.txt
│  └─ routes/             # auth, menu, orders, admin, courier
├─ frontend/
│  ├─ index.html          # shell de la PWA
│  ├─ manifest.json
│  ├─ sw.js
│  ├─ css/                # tokens, base, componentes y pantallas
│  ├─ js/                 # router, estado, API, UI, PWA y mapas
│  │  └─ screens/         # auth, client, profile, admin, courier
│  └─ assets/             # iconos, QR y Leaflet local
├─ Procfile
├─ render.yaml
└─ README.md
```

## Notas de demo

- Los pagos son simulados; no se procesa dinero real.
- El seguimiento y las rutas son ilustrativos sobre OpenStreetMap.
- El modo demo cambia de rol desde **Perfil → Cambiar de rol**.
- La instalación y el service worker requieren HTTPS o `localhost`.
- Si cambias archivos del frontend, recarga con `Ctrl + F5`. Si actualizas el service worker, cierra todas las pestañas o usa la recarga que ofrece la app.
