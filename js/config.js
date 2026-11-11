// ─────────────────────────────────────────────────────────────
//  SINAPSIS · Configuración general
//  Este es el único archivo que normalmente necesitas editar.
//  Después de editarlo, vuelve a generar los archivos autónomos:
//      node tools/empaquetar.mjs
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  // Nombre y subtítulo que aparecen en pantalla
  appName: 'SINAPSIS',
  subtitle: 'Evaluación de Inteligencia Artificial',

  // Texto opcional de organización o área (p. ej. 'Tecnología · Equipo de Ingeniería').
  // Déjalo vacío si el sitio será público.
  org: '',

  // Ruta a un logotipo APROBADO por tu equipo de marca (p. ej. 'privado/logo.svg').
  // Por defecto vacío: el repositorio público no incluye logotipos de marca.
  logoUrl: '',

  // Segundos por pregunta (el tiempo NO da puntos; solo marca el ritmo)
  questionSeconds: 40,

  // Cómo se identifican los participantes:
  //   'alias'   → eligen un alias (recomendado)
  //   'nombre'  → escriben su nombre
  //   'anonimo' → sin nombre; solo estadísticas agregadas
  identity: 'nombre',

  // Preguntar "¿Qué tan seguro estás?" después de cada respuesta
  askConfidence: true,

  // ── Conexión (sin plataformas externas) ──────────────────
  //   'auto'    → usa la red local si la app la sirve tools/servidor.mjs;
  //               si no (GitHub Pages o archivo HTML), usa códigos.
  //   'red'     → forzar modo en vivo por red local
  //   'codigos' → forzar modo sin conexión (códigos por chat)
  mode: 'auto',

  // Dirección que verán los participantes en el modo sin conexión
  // (p. ej. 'https://tu-usuario.github.io/sinapsis-ia/play.html').
  // Si está vacío se usa la página actual, o el nombre del archivo compartido.
  participantUrl: '',
  participantFile: 'sinapsis-participante.html',

  // Archivos de datos
  bankUrl: 'data/banco.enc.json', // banco cifrado (solo el anfitrión lo abre)
  publicUrl: 'data/publico.json', // datos sin respuestas para el dossier del participante
};
