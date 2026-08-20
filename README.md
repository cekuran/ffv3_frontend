# family finances frontend

HTML único y autocontenido (`Index.html`). Todo el CSS, JS y estado viven en un solo archivo. Sin build, sin bundler, sin transpiler — lo que se commitea es lo que se sirve.

Llama al **proxy** (que reenvía al **backend**) vía `fetch` contra la constante `API_URL` (línea ~1466). El token vive en `localStorage` bajo `ff_auth_token`.

## Repos relacionados

| Repo | Función | URL |
|------|---------|-----|
| family finances backend | Apps Script WebApp con la lógica y datos | https://github.com/cekuran/ffv3_backend |
| family finances proxy | Cloudflare Worker intermedio (CORS + caché) | https://github.com/cekuran/ffv3_proxy |
| family finances tools | Despliega los tres a la vez y reescribe `API_URL` | https://github.com/cekuran/ffv3_tools |

Flujo: `Index.html → API_URL → proxy → backend → Sheets`.

## Setup inicial

Requisitos: Python 3 (para preview local) o cualquier servidor estático. Node solo si vas a correr el test de caché.

```bash
git clone git@github.com:cekuran/ffv3_frontend.git
cd ffv3_frontend
python -m http.server 8000 -d .
# abrir http://localhost:8000
```

**No abrir `Index.html` con `file://`** — el `fetch` a Apps Script está bloqueado desde origen nulo (`Index.html:1478`).

## Configuración básica

1. **`API_URL`** (~línea 1466): URL del proxy (no del backend directo). El script de **tools** la reescribe automáticamente en cada deploy. Para configurarla a mano, apuntar al endpoint del Worker en Cloudflare.
2. **Token**: lo emite el backend en login. El frontend lo guarda en `localStorage.ff_auth_token`. Sin token no hay bootstrap.
3. **Caché de bootstrap** (`ff_bootstrap_cache`): TTL 24h, ventana de revalidación 60s. `transacciones` se excluye del caché a propósito. Test del caché: `node test_bootstrap_cache.js` (no toca red).

## Despliegue

Manual:

```bash
netlify deploy --dir . --no-build --prod
```

Orquestado (recomendado): **family finances tools** opción 4 — hace `netlify deploy --prod`, reescribe `API_URL` y actualiza `release_info.txt`.

## Convenciones

- Estado en un solo objeto `Estado` (`Index.html:1443`). Mutaciones vía funciones de render pequeñas, sin framework.
- CSS usa tokens Material 3 declarados en `:root` (líneas ~10–50). No usar valores hardcodeados fuera de `:root`.
- UI en español. No traducir.
- Llamadas: `await call('accion', arg1, arg2)`. Errores: `payload.error` desde `rawCall` (`Index.html:1468`).

## Estructura

```
frontend/
├── Index.html            # la app completa
├── test_bootstrap_cache.js
├── .netlifyignore
└── .gitignore
```