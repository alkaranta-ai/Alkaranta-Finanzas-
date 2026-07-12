// ==========================================================================
// FINANCE CHAT AI — capa híbrida sobre FinanceChatApp (financeChat.js)
//
// No reemplaza el motor de reglas: lo usa como red de seguridad. El flujo es:
//   1) Si hay internet y no se llegó al límite diario → le pregunta a Gemini,
//      pasándole el saldo/presupuestos/metas REALES del usuario como contexto.
//   2) Si algo falla (sin internet, Worker caído, límite diario alcanzado)
//      → cae automáticamente al motor de reglas de financeChat.js, que sigue
//      funcionando exactamente igual que antes.
//
// REQUIERE que financeChat.js esté cargado ANTES que este archivo:
//   <script src="js/financeChat.js"></script>
//   <script src="js/financeChatAI.js"></script>
//
// CAMBIO EN LA UI: donde antes llamabas a
//   const r = FinanceChatApp.getBotResponse(mensaje); pintarBurbuja(r.text);
// ahora llamá a (es async):
//   const texto = await FinanceChatApp.getBotResponseSmart(mensaje);
//   pintarBurbuja(texto);
// Mostrá un indicador de "escribiendo..." mientras se resuelve la promesa,
// la respuesta de la IA tarda 1-2 segundos (vs. instantáneo del motor de
// reglas), así que la espera se tiene que sentir intencional, no colgada.
// ==========================================================================

(function () {
  const WORKER_URL = 'https://misty-cell-91e2finance-chat-alkaranta.alkaranta.workers.dev';
  const LIMITE_DIARIO = 40; // mensajes con IA por día por usuario/dispositivo
  const MAX_HISTORIAL = 10; // turnos de contexto que se le mandan a la IA

  const SYSTEM_PROMPT = `
IDIOMA: Respondé SIEMPRE en español rioplatense (Argentina). Nunca respondas
en inglés ni en ningún otro idioma, sin importar en qué idioma te escriba el
usuario o qué contenga el contexto que te paso. Esta regla no tiene excepciones.

Sos el asistente financiero de Alkaranta, una app de finanzas personales para
usuarios argentinos. Hablás en español rioplatense, con lunfardo natural
(che, posta, laburo, guita) pero sin exagerar ni sonar forzado — como un
amigo que sabe de números, no como un cajero automático con personalidad.

Reglas:
- SIEMPRE en español rioplatense, nunca en inglés (repetido a propósito: es la regla más importante).
- Respuestas cortas: 2 a 4 oraciones, salvo que el usuario pida más detalle.
- Usá SIEMPRE los datos reales del usuario que te paso en [DATOS ACTUALES].
  Nunca inventes cifras, categorías o metas que no estén ahí.
- Si falta un dato porque el usuario no cargó movimientos, decilo con onda
  y pedile que cargue algo — no lo inventes ni lo asumas.
- No sos asesor financiero certificado: para inversión, deuda grande o temas
  impositivos/legales, aclará que es orientación general, no profesional.
- Máximo 1-2 emojis por respuesta.
- Mantené el hilo: si el usuario responde corto ("dale", "por qué", "y
  entonces qué hago"), entendé que se refiere a tu mensaje anterior y
  segui esa conversación, no arranques de cero.
- Si el usuario está frustrado o angustiado con la plata, priorizá la
  contención antes que tirarle números fríos.
`.trim();

  function usageKey() {
    const hoy = new Date().toISOString().slice(0, 10);
    return `alkaranta_ai_uso_${hoy}`;
  }

  function usoDeHoy() {
    return parseInt(localStorage.getItem(usageKey()) || '0', 10);
  }

  function registrarUso() {
    localStorage.setItem(usageKey(), String(usoDeHoy() + 1));
  }

  function limiteAlcanzado() {
    return usoDeHoy() >= LIMITE_DIARIO;
  }

  // Arma un resumen en texto plano del estado financiero real del usuario,
  // reusando las funciones que YA existen en financeChat.js — no duplica
  // lógica, solo la traduce a algo que la IA pueda leer.
  function construirContexto() {
    const app = window.FinanceChatApp;
    const r = app._resumenMes();
    const top = app._topCategoriaMes();
    const presu = app._estadoPresupuestos();
    const metas = app._metasDelModo();
    const tasa = app._tasaAhorroMes();
    const hormiga = app._gastosHormigaMes();

    const lineas = [];
    lineas.push(`Modo actual: ${typeof modoActual !== 'undefined' ? modoActual : 'personal'}`);
    lineas.push(`Mes actual: ${app._mesActualISO()}`);

    if (r.cantidad > 0) {
      lineas.push(`Ingresos del mes: ${app._fmtMoney(r.ingresos)}`);
      lineas.push(`Egresos del mes: ${app._fmtMoney(r.egresos)}`);
      lineas.push(`Saldo del mes: ${app._fmtMoney(r.saldo)}`);
      lineas.push(`Movimientos cargados: ${r.cantidad}`);
    } else {
      lineas.push('Todavía no hay movimientos cargados este mes.');
    }

    if (top) lineas.push(`Categoría con más gasto: ${top.categoria} (${app._fmtMoney(top.monto)})`);
    if (tasa !== null) lineas.push(`Tasa de ahorro del mes: ${tasa}%`);
    if (hormiga) lineas.push(`Posible gasto hormiga: ${hormiga.cat} (${hormiga.cantidad} movimientos, total ${app._fmtMoney(hormiga.total)})`);

    if (presu.length > 0) {
      const enRiesgo = presu.filter(p => p.pct >= 0.8);
      lineas.push(enRiesgo.length > 0
        ? `Presupuestos al límite o pasados: ${enRiesgo.map(p => `${p.cat} (${Math.round(p.pct * 100)}%)`).join(', ')}`
        : 'Todos los presupuestos están dentro del límite.');
    }

    if (metas.length > 0) {
      lineas.push(`Metas activas: ${metas.map(m => `${m.nombre} (${Math.min(Math.round((m.ahorrado / m.objetivo) * 100), 100)}%)`).join(', ')}`);
    }

    return lineas.join('\n');
  }

  window.FinanceChatApp._historialIA = window.FinanceChatApp._historialIA || [];

  function agregarAlHistorial(role, text) {
    const h = window.FinanceChatApp._historialIA;
    h.push({ role, parts: [{ text }] });
    while (h.length > MAX_HISTORIAL) h.shift();
  }

  async function pedirleALaIA(userMessage) {
    const contexto = construirContexto();
    const nombre = (typeof currentUser !== 'undefined' && currentUser && currentUser.displayName)
      ? currentUser.displayName.split(' ')[0]
      : null;

    const mensajeConContexto =
      `[INSTRUCCIÓN DE IDIOMA] Respondé en español rioplatense (Argentina), nunca en inglés.\n` +
      `[DATOS ACTUALES DEL USUARIO]\n${contexto}\n` +
      (nombre ? `[NOMBRE] ${nombre}\n` : '') +
      `[MENSAJE DEL USUARIO]\n${userMessage}`;

    const contents = [
      ...window.FinanceChatApp._historialIA,
      { role: 'user', parts: [{ text: mensajeConContexto }] },
    ];

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: SYSTEM_PROMPT, contents }),
    });

    if (!res.ok) throw new Error('worker_error_' + res.status);
    const data = await res.json();
    if (!data.text) throw new Error('sin_texto');

    agregarAlHistorial('user', userMessage);
    agregarAlHistorial('model', data.text);
    registrarUso();

    return data.text;
  }

  // Punto de entrada único para la UI. SIEMPRE devuelve un string (nunca
  // rechaza la promesa): si la IA falla por lo que sea, cae solo al motor
  // de reglas de financeChat.js sin que el usuario note el problema.
  window.FinanceChatApp.getBotResponseSmart = async function (userMessage) {
    if (!navigator.onLine || limiteAlcanzado()) {
      return this.getBotResponse(userMessage).text;
    }
    try {
      return await pedirleALaIA(userMessage);
    } catch (err) {
      console.warn('FinanceChatAI: fallback al motor de reglas →', err.message);
      return this.getBotResponse(userMessage).text;
    }
  };
})();
