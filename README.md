# SINAPSIS

Evaluación de conocimientos de inteligencia artificial para equipos de ingeniería, conducida en vivo. El anfitrión proyecta la sesión, cada participante responde desde su celular o laptop y al final se presentan los resultados del equipo. No hay ranking ni puntajes individuales en pantalla.

- 10 preguntas sobre modelos, agentes y workflows, protocolos (MCP y A2A), manejo de contexto, y seguridad y gobierno.
- Tras cada pregunta se muestra la respuesta correcta, cómo respondió el equipo y una explicación.
- Resultados del equipo: promedio de aciertos, aciertos por área y por pregunta, relación entre confianza y acierto, respuestas incorrectas más elegidas y temas de capacitación sugeridos.
- Cada participante ve sus propios resultados al final, en su dispositivo.
- No depende de servicios externos: la laptop del anfitrión sirve la aplicación dentro de la red de la oficina.

## Requisitos

- [Node.js](https://nodejs.org) 18 o superior en la laptop del anfitrión.
- Que los participantes estén en la misma red que esa laptop.

## Uso

1. Ejecuta `iniciar.bat` (o `node tools/servidor.mjs`). La consola muestra la dirección para compartir, por ejemplo:

   ```
   1) Abre la consola del anfitrión:   http://localhost:8080/host.html
   2) Comparte este link con tu equipo: http://10.20.30.40:8080
   ```

2. En la consola del anfitrión, escribe la clave de la sesión y pulsa **Comenzar**.
3. Comparte el enlace o deja que escaneen el código QR. Cada participante escribe su nombre y entra.
4. Avanza con la barra espaciadora o la flecha derecha.
5. En los resultados, mueve el mouse para ver las opciones de descarga y, al terminar, pulsa **Cerrar sala**.

`localhost` solo funciona en la laptop del anfitrión. A los participantes se les comparte la dirección con la IP que muestran la consola y la sala.

Si Windows pregunta por el firewall la primera vez, permite el acceso de Node.js a redes privadas o de dominio.

### Controles

| Tecla | Acción |
|---|---|
| Espacio, → o Av Pág | Continuar |
| M | Activar o silenciar el sonido |
| F | Pantalla completa |
| B | Agregar participantes simulados (en la sala de espera) |

Los botones del anfitrión aparecen al mover el mouse y se ocultan solos para que la pantalla proyectada se vea limpia.

### Guardado y recuperación

- La sesión se guarda de forma continua en la carpeta `resultados/`.
- Si la consola se recarga o se cierra, al volver a entrar se ofrece **Continuar donde se quedó**, con los mismos participantes, respuestas y código de sala.
- Si un participante cierra su pestaña, vuelve a abrir el enlace y recupera su lugar con el mismo nombre.
- Al llegar a los resultados se guardan automáticamente dos archivos de Excel (participantes y preguntas) y un respaldo completo.
- La carpeta `resultados/` solo es accesible desde la laptop del anfitrión y no forma parte del repositorio.

## Modo sin conexión

Si la red no permite que otros equipos se conecten a la laptop del anfitrión:

1. Abre `dist/sinapsis-anfitrion.html` y comparte `dist/sinapsis-participante.html` con el equipo.
2. Cada participante responde en su dispositivo siguiendo la pantalla del anfitrión.
3. Al final, cada uno copia su código de resultados en el chat de la reunión.
4. El anfitrión pega los códigos en la pantalla de envío de resultados y se generan los resultados del equipo.

## Preguntas

Las preguntas publicadas están cifradas en `data/banco.enc.json`, de modo que las respuestas no son visibles en el código. La versión editable vive en `privado/banco.json`, que no forma parte del repositorio.

Para modificarlas:

```bash
node tools/cifrar.mjs
```

```bash
node tools/empaquetar.mjs
```

El primer comando cifra el banco y actualiza `data/`; el segundo regenera los archivos de `dist/`. También es posible editar y cifrar desde el navegador con `tools/cifrar.html`.

Formato de cada pregunta (`correct` vale 0 para A, 1 para B, 2 para C y 3 para D):

```json
{
  "domain": "contexto",
  "level": "Avanzado",
  "difficulty": 3,
  "text": "Pregunta",
  "options": ["A", "B", "C", "D"],
  "correct": 0,
  "explanation": "Explicación que se muestra al revelar la respuesta."
}
```

## Configuración

Las opciones están en `js/config.js`:

| Opción | Descripción |
|---|---|
| `appName`, `subtitle`, `org` | Textos de pantalla |
| `logoUrl` | Ruta a un logotipo (vacío por defecto) |
| `questionSeconds` | Segundos por pregunta |
| `identity` | `'nombre'`, `'alias'` o `'anonimo'` |
| `askConfidence` | Preguntar el nivel de confianza después de cada respuesta |
| `mode` | `'auto'`, `'red'` o `'codigos'` |

Después de cambiar la configuración, ejecuta `node tools/empaquetar.mjs`.

## Estructura

```
index.html          Redirige a la página del participante
host.html           Consola del anfitrión
play.html           Página del participante
css/                Estilos
js/                 Lógica de la aplicación
data/               Preguntas cifradas y datos públicos
dist/               Versión de archivos independientes (modo sin conexión)
tools/              Servidor local, cifrado y empaquetado
```
