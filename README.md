# SINAPSIS · Evaluación de Inteligencia Artificial

Evaluación al estilo de una sesión en vivo, **sin carrera ni ganador**. El anfitrión proyecta la pantalla, los ingenieros responden desde su celular o laptop, y al final se obtiene un **Informe de Inteligencia Colectiva** con lo que sabe el equipo.

**No necesita ninguna plataforma externa**: ni Firebase, ni bases de datos, ni cuentas. Tu laptop sirve la app dentro de la red de la oficina.

- 10 preguntas sobre **modelos, agentes y workflows, protocolos (MCP/A2A), contexto, y seguridad y gobierno**.
- Tema claro corporativo con la paleta roja, negra y gris de referencia. Valida los valores con tu equipo de marca.
- Prólogo cinematográfico, cortinillas rojas, red neuronal con la constelación de participantes y sonido sintetizado (sin música con derechos de autor).
- Informe: índice del equipo, dominio por área, **matriz de calibración** (confianza vs. acierto), acierto por pregunta, distribución de puntajes, confusiones frecuentes y recomendaciones de capacitación.
- Cada participante recibe un **dossier privado** en su dispositivo.
- Exportación a CSV (Excel) y JSON.

---

## Cómo usarlo (en vivo, en la red de la oficina) ✅

Requisito: [Node.js](https://nodejs.org) 18 o superior en la laptop del anfitrión.

1. Haz doble clic en **`iniciar.bat`**, o ejecuta:
   ```bash
   node tools/servidor.mjs
   ```
   La consola muestra algo como:
   ```
   1) Abre la consola del anfitrión:   http://localhost:8080/host.html
   2) Comparte este link con tu equipo: http://10.20.30.40:8080
   ```
2. Se abre la consola del anfitrión. Escribe la **clave de la sesión** (está en `privado/clave.txt`) y pulsa **Comenzar**.
3. **Comparte el link** (por ejemplo `http://10.20.30.40:8080`) en el chat, o deja que escaneen el QR del lobby.
   - Cada persona abre el link, **escribe su nombre** y toca **Entrar**. No hay PIN ni configuración: la sala se encuentra sola.
   - Su nombre aparece en la constelación del lobby.
4. Avanza con **Espacio** o **→**. Las respuestas llegan en tiempo real, en cada revelación se ve la distribución del equipo y al final cada quien ve su dossier.
5. En el informe, mueve el mouse para ver los botones de descarga (Excel o respaldo completo) y pulsa **Cerrar sala**.

### Todo se guarda solo

- La sesión (participantes, respuestas y avance) se guarda continuamente en la carpeta **`resultados/`** de tu laptop.
- **Si la consola se recarga, se cierra o se reinicia la laptop**, vuelve a abrir SINAPSIS: la pantalla de inicio ofrecerá **«Continuar donde se quedó»**, con los mismos participantes, respuestas y código de sala.
- **Si un participante cierra su pestaña**, vuelve a abrir el link: se le ofrece «¿Eres Ana? Toca Entrar para continuar» y recupera su lugar y sus respuestas.
- Al llegar al informe se guardan automáticamente en `resultados/` los archivos de Excel (participantes y preguntas) y un respaldo completo, aunque no los descargues.
- La carpeta `resultados/` solo se puede abrir desde tu laptop (no desde otros equipos de la red) y no se sube al repositorio.

> ⚠️ **`localhost` solo funciona en tu laptop.** A tu equipo comparte siempre el link con la IP que muestran la consola y el lobby.

> ⚠️ **Firewall:** la primera vez, Windows puede preguntar si permites el acceso de Node.js a la red. Acepta para redes privadas o de dominio. Si la política de tu empresa lo bloquea y tus compañeros no logran abrir el link, usa el modo sin conexión.

### Controles del anfitrión

| Tecla | Acción |
|---|---|
| Espacio / → / Av Pág | Continuar (saltar prólogo, iniciar, cerrar respuestas, siguiente) |
| M | Activar o silenciar el sonido |
| F | Pantalla completa |
| B | Agregar participantes de ensayo (en el lobby) |

Los botones del anfitrión (sonido, pantalla completa, simular participantes y descargas del informe) **aparecen solo al mover el mouse**, para que la pantalla proyectada se vea limpia.

**Ensayo:** en el lobby pulsa **B** (o mueve el mouse y elige **Simular participantes**) para simular 24 personas y ver el informe completo antes de la sesión real.

---

## Alternativa: modo sin conexión (códigos)

Úsalo si la red no permite que otros equipos se conecten a tu laptop.

1. Abre `dist/sinapsis-anfitrion.html` con doble clic y comparte `dist/sinapsis-participante.html` en el chat.
2. Cada persona responde en su dispositivo siguiendo tu pantalla.
3. Al final, cada quien toca **Copiar mensaje** y lo pega en el chat (`SINAPSIS · Nombre · SNP-…`).
4. En la pantalla de **Sincronización** pulsa **Pegar códigos del chat**, pega todo el chat y genera el informe.
5. En los créditos aparece una **clave** para que cada persona desbloquee su dossier.

---

## Editar las preguntas

El banco que se publica está **cifrado** (`data/banco.enc.json`, AES-GCM 256): nadie puede leer las respuestas en el código. La versión editable es `privado/banco.json`, que no se sube al repositorio.

1. Edita `privado/banco.json`. En `reserve` hay 3 preguntas de reserva. Cada pregunta tiene esta forma:
   ```json
   {
     "domain": "contexto",
     "level": "Avanzado",
     "difficulty": 3,
     "text": "Pregunta…",
     "options": ["A", "B", "C", "D"],
     "correct": 0,
     "explanation": "Debrief que se muestra al revelar."
   }
   ```
   `correct` vale 0 para A, 1 para B, 2 para C y 3 para D.
2. Cifra y regenera los archivos:
   ```bash
   node tools/cifrar.mjs
   ```
   ```bash
   node tools/empaquetar.mjs
   ```

También puedes abrir `http://localhost:8080/tools/cifrar.html` para editar y cifrar desde el navegador, o arrastrar `privado/banco.json` sobre la pantalla de inicio de la consola para usarlo directamente.

---

## Configuración (`js/config.js`)

| Opción | Para qué sirve |
|---|---|
| `appName`, `subtitle`, `org` | Textos de pantalla |
| `logoUrl` | Logo aprobado (vacío por defecto) |
| `questionSeconds` | Segundos por pregunta (40). El tiempo **no** da puntos |
| `identity` | `'nombre'`, `'alias'` o `'anonimo'` |
| `askConfidence` | Preguntar "¿qué tan seguro estás?" para la matriz de calibración |
| `mode` | `'auto'` (red local si hay servidor; si no, códigos), `'red'` o `'codigos'` |

Después de cambiar la configuración, ejecuta `node tools/empaquetar.mjs` para actualizar `dist/`.

---

## Privacidad y datos

- [ ] Nada sale de la red de la oficina: los datos viajan entre tu laptop y los dispositivos de tus compañeros.
- [ ] Pide solo el nombre de pila. La app rechaza correos y números largos.
- [ ] Al terminar, exporta los resultados y pulsa **Cerrar sala**.
- [ ] Guarda los CSV y JSON exportados en una ubicación aprobada.
- [ ] La carpeta `privado/` (banco editable y clave) **no se sube al repositorio**.

---

## Estructura

```
index.html                  Lleva directo a la página del participante
host.html · play.html       Consola del anfitrión · página del participante
css/                        Estilos
js/config.js                Configuración
js/host.js · js/play.js     Flujos del anfitrión y del participante
js/transport.js             Tiempo real por red local
js/codes.js                 Códigos de resultados (modo sin conexión)
js/stats.js · js/charts.js  Estadísticas, exportación y gráficas
js/network.js · js/audio.js Red neuronal animada y sonido
js/crypto.js                Cifrado del banco
data/banco.enc.json         Banco cifrado
data/publico.json           Datos sin respuestas para el dossier
dist/                       Archivos autónomos (modo sin conexión)
privado/                    Banco editable y clave (NO se sube)
tools/                      Servidor local, cifrado y empaquetado
```

## Solución de problemas

- **Mis compañeros no abren el link**: confirma que usas la IP y no `localhost`, que estén en la misma red y que el firewall permita Node.js.
- **«La sala aún no está abierta»**: abre la sala en la consola del anfitrión y pide que recarguen la página.
- **"Clave incorrecta"**: revisa `privado/clave.txt`.
- **No suena nada**: el navegador exige una interacción previa. Pulsa **M** o haz clic en la pantalla.
- **No recargues la consola del anfitrión** durante la sesión: el navegador te pedirá confirmar.
