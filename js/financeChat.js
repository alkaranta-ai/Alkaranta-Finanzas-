/ ==========================================================================
// FINANCE CHAT — "el Nutrio de las finanzas" para Alkaranta
// Mismo tono, mismas mañas (lunfardo, humor, che), pero la inteligencia
// ahora es 100% financiera: lee tus propios movimientos, presupuestos y
// metas (las variables globales que ya existen en script.js) para darte
// respuestas que hablan de VOS, no genéricas.
//
// v3: MUCHAS más respuestas por categoría (rotación más rica, menos
// repetición) + categorías nuevas (alquiler/expensas/impuestos,
// vacaciones, sueldo/aguinaldo, gastos compartidos, freelance/ingreso
// irregular, inversiones básico, motivación/celebración, comparar modo
// personal vs. laboral, cambio de humor del usuario, preguntas sobre el
// propio chat) sumadas a todo lo que ya tenías (comparar meses, gastos
// hormiga, deudas/tarjeta, fondo de emergencia, ingresos extra,
// frustración del usuario, ayuda/comandos, chistes, etc.)
//
// Cómo integrarlo:
// 1) Guardá este archivo como js/financeChat.js
// 2) Cargalo en tu HTML después de script.js:
//      <script src="js/financeChat.js"></script>
// 3) Agregá una sección de chat y un botón de nav (ver notas al final del
//    archivo) — como no tengo tu index.html/CSS todavía, dejé la UI en un
//    bloque aparte para que la puedas pegar y ajustar a tus clases/colores.
// ==========================================================================

window.FinanceChatApp = {

  _lastVariantByCategory: {},

  // ------------------------------------------------------------------
  // Utilidades de texto (mismo approach que Nutrio: sacar tildes, pasar
  // a minúsculas, traducir lunfardo típico de plata/laburo).
  // ------------------------------------------------------------------
  _normalize(str) {
    let s = str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const lunfardo = [
      [/\bplata\b|\bguita\b|\bmangos\b|\bmanguitos\b|\bmorlacos\b|\bpesos\b/g, 'dinero'],
      [/\blaburo\b|\blaburando\b|\bchamba\b/g, 'trabajo'],
      [/\bestoy palo\b|\bestoy seco\b|\bestoy quebrado\b|\bestoy limpio\b|\bno tengo un mango\b/g, 'no tengo dinero'],
      [/\bme funde\b|\bme fundi\b|\bme funda\b/g, 'gasté de más'],
      [/\bandar en pedo con la plata\b|\bestoy en la lona\b/g, 'estoy sin dinero'],
      [/\bahorrar\b/g, 'ahorrar']
    ];
    lunfardo.forEach(([regex, replacement]) => {
      s = s.replace(regex, replacement);
    });

    return s;
  },

  _getFeedbackStore() {
    return JSON.parse(localStorage.getItem('alkaranta_chat_feedback')) || {};
  },

  recordFeedback(category, idx, liked) {
    const feedback = this._getFeedbackStore();
    if (!feedback[category]) feedback[category] = { liked: [], disliked: [] };
    feedback[category].liked = feedback[category].liked.filter(i => i !== idx);
    feedback[category].disliked = feedback[category].disliked.filter(i => i !== idx);
    if (liked) feedback[category].liked.push(idx);
    else feedback[category].disliked.push(idx);
    localStorage.setItem('alkaranta_chat_feedback', JSON.stringify(feedback));
  },

  pickVariant(category, variants, ...args) {
    const feedback = this._getFeedbackStore();
    const catFeedback = feedback[category] || { liked: [], disliked: [] };

    let available = variants.map((_, i) => i).filter(i => !catFeedback.disliked.includes(i));
    if (available.length === 0) available = variants.map((_, i) => i);

    const last = this._lastVariantByCategory[category];
    if (available.length > 1 && last !== undefined) {
      const withoutLast = available.filter(i => i !== last);
      if (withoutLast.length > 0) available = withoutLast;
    }

    const idx = available[Math.floor(Math.random() * available.length)];
    this._lastVariantByCategory[category] = idx;

    const raw = variants[idx];
    const text = typeof raw === 'function' ? raw(...args) : raw;

    return { text, category, idx };
  },

  // ------------------------------------------------------------------
  // Helpers que leen el ESTADO REAL de la app (definidos en script.js:
  // movimientos, presupuestos, metas, categorias, modoActual, pertenece()).
  // ------------------------------------------------------------------
  _mesActualISO() {
    return new Date().toISOString().slice(0, 7);
  },

  _mesAnteriorISO() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  },

  _fmtMoney(n) {
    return '$' + Math.round(n).toLocaleString('es-AR');
  },

  _resumenMesDe(mesISO) {
    const delMes = movimientos.filter(m => pertenece(m) && m.fecha && m.fecha.startsWith(mesISO));
    const ingresos = delMes.filter(m => m.tipo === 'Ingreso').reduce((s, m) => s + m.monto, 0);
    const egresos = delMes.filter(m => m.tipo === 'Egreso').reduce((s, m) => s + m.monto, 0);
    return { ingresos, egresos, saldo: ingresos - egresos, cantidad: delMes.length };
  },

  _resumenMes() {
    return this._resumenMesDe(this._mesActualISO());
  },

  _topCategoriaMes() {
    const mes = this._mesActualISO();
    const porCat = {};
    movimientos
      .filter(m => pertenece(m) && m.tipo === 'Egreso' && m.fecha && m.fecha.startsWith(mes))
      .forEach(m => { porCat[m.categoria] = (porCat[m.categoria] || 0) + m.monto; });
    const sorted = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
    return sorted.length ? { categoria: sorted[0][0], monto: sorted[0][1] } : null;
  },

  _estadoPresupuestos() {
    const mes = this._mesActualISO();
    const keys = Object.keys(presupuestos).filter(k => k.startsWith(modoActual + '_'));
    return keys.map(key => {
      const cat = key.replace(modoActual + '_', '');
      const limite = presupuestos[key];
      const gastado = movimientos
        .filter(m => pertenece(m) && m.tipo === 'Egreso' && m.categoria === cat && m.fecha && m.fecha.startsWith(mes))
        .reduce((s, m) => s + m.monto, 0);
      return { cat, limite, gastado, pct: limite > 0 ? gastado / limite : 0 };
    });
  },

  _metasDelModo() {
    return metas.filter(m => (m.entidad || 'personal') === modoActual);
  },

  _tasaAhorroMes() {
    const { ingresos, egresos } = this._resumenMes();
    if (ingresos <= 0) return null;
    return Math.round(((ingresos - egresos) / ingresos) * 100);
  },

  // Categorías chicas y repetidas = candidatas a "gasto hormiga"
  _gastosHormigaMes() {
    const mes = this._mesActualISO();
    const delMes = movimientos.filter(m => pertenece(m) && m.tipo === 'Egreso' && m.fecha && m.fecha.startsWith(mes));
    const porCat = {};
    delMes.forEach(m => {
      if (!porCat[m.categoria]) porCat[m.categoria] = { total: 0, cantidad: 0 };
      porCat[m.categoria].total += m.monto;
      porCat[m.categoria].cantidad += 1;
    });
    // "hormiga" = muchos movimientos chicos que suman
    const candidatos = Object.entries(porCat)
      .filter(([, v]) => v.cantidad >= 4)
      .map(([cat, v]) => ({ cat, total: v.total, cantidad: v.cantidad, promedio: v.total / v.cantidad }))
      .sort((a, b) => b.total - a.total);
    return candidatos.length ? candidatos[0] : null;
  },

  // Ingresos irregulares: variación mes a mes en los últimos 3 meses con datos
  _volatilidadIngresos() {
    const mesesISO = [];
    const d = new Date();
    for (let i = 0; i < 3; i++) {
      mesesISO.push(d.toISOString().slice(0, 7));
      d.setMonth(d.getMonth() - 1);
    }
    const valores = mesesISO
      .map(m => this._resumenMesDe(m))
      .filter(r => r.cantidad > 0)
      .map(r => r.ingresos);
    if (valores.length < 2) return null;
    const max = Math.max(...valores), min = Math.min(...valores);
    const variacionPct = min > 0 ? Math.round(((max - min) / min) * 100) : null;
    return { max, min, variacionPct };
  },

  // ------------------------------------------------------------------
  // El cerebro: misma estructura que Nutrio (if / pickVariant), pero
  // todo el contenido es de plata, presupuesto, metas y hábitos financieros.
  // ------------------------------------------------------------------
  getBotResponse(userMessage) {
    const msg = this._normalize(userMessage);
    const nameSuffix = (typeof currentUser !== 'undefined' && currentUser && currentUser.displayName)
      ? ` ${currentUser.displayName.split(' ')[0]}`
      : ' che';

    // --- Despedidas ---
    const esDespedida =
      /\bchau\b/.test(msg) || /\bnos vemos\b/.test(msg) || /\bhasta luego\b/.test(msg) ||
      /\bhasta manana\b/.test(msg) || /\bme voy\b/.test(msg) || /\badios\b/.test(msg) || /\bbye\b/.test(msg) ||
      /\bnos hablamos\b/.test(msg) || /\bhasta la proxima\b/.test(msg) || /\bme desconecto\b/.test(msg);
    if (esDespedida) {
      return this.pickVariant('despedida', [
        (n) => `¡Chau${n}! Que la plata te rinda. Nos vemos en la próxima. 👋`,
        (n) => `¡Nos vemos${n}! Cualquier duda de guita, ya sabés dónde encontrarme. 💸`,
        (n) => `¡Dale${n}, cuidate! No te olvides de cargar los movimientos de hoy. 📊`,
        (n) => `¡Listo${n}! Andá tranquilo, yo sigo acá cuidándote los números. 🫡`,
        (n) => `Chau chau${n}. Antes de irte: ¿cargaste todo lo de hoy? Total, dos minutos y listo. 📝`,
        (n) => `¡Nos vemos${n}! Ojalá tu saldo también se vaya de vacaciones alguna vez. 😅`,
        (n) => `¡Dale${n}! Me quedo acá guardando tus números hasta la próxima. 🗂️`,
        (n) => `Chau${n}, éxitos con la economía doméstica. Mañana seguimos. 🌙`,
        (n) => `¡Nos vemos${n}! Si te tienta algo caro esta noche, dormí la decisión y decidís mañana. 😉`,
        (n) => `Listo${n}, quedate tranquilo. Yo te espero acá con la calculadora prendida. 🔢`
      ], nameSuffix);
    }

    // --- Saludos ---
    if (msg.includes('hola') || msg.includes('buen') || msg.includes('que onda') || msg.includes('como andas')) {
      return this.pickVariant('saludo', [
        (n) => `¡Qué hacés${n}! Contame, ¿querés ver cómo venís este mes, hablar de tu presupuesto, o tenés alguna duda de finanzas en general? 💰`,
        (n) => `¡Hola${n}! Acá ando, con la calculadora lista. ¿En qué te ayudo con tu plata hoy?`,
        (n) => `¡Buenas${n}! ¿Charlamos de números o tenés alguna duda de economía en general?`,
        (n) => `¡Ey${n}! Bienvenido de nuevo. ¿Vemos el estado de tus cuentas o tenés algo puntual en mente?`,
        (n) => `¡Hola${n}! Antes de arrancar: ¿querés un resumen rápido de cómo venís este mes?`,
        (n) => `¡Qué tal${n}! Yo bien, contando billetes ajenos como todo buen asistente financiero. ¿Vos cómo venís? 😄`,
        (n) => `¡Hola${n}! ¿Arrancamos por tu saldo, tu presupuesto o alguna meta puntual?`,
        (n) => `¡Buenas${n}! Decime nomás qué necesitás y vemos los números juntos.`,
        (n) => `¡Ey${n}! ¿Vinimos a mirar cómo va todo o tenés una pregunta específica hoy?`,
        (n) => `¡Hola${n}! Preparate: hoy vengo con ganas de tirarte data útil sobre tu plata. 📊`
      ], nameSuffix);
    }

    // --- Agradecimientos ---
    if (msg.includes('gracias') || msg.includes('genial') || msg.includes('joya') || msg.includes('de diez') || msg.includes('sos groso') || msg.includes('barbaro') || msg.includes('excelente')) {
      return this.pickVariant('gracias', [
        `¡De una! Cualquier cosita de tus números, acá ando. 🙌`,
        `¡Buenísimo, me alegro que sirva! Seguimos viendo cómo te va con la plata. 😄`,
        `¡Para eso estoy! Si en algún momento la cosa se complica con el presupuesto, avisame. 💪`,
        `¡Dale, un placer! Ojalá tu cuenta bancaria me agradezca a mí también algún día. 😅`,
        `¡Gracias a vos por cargar los movimientos, así puedo tirarte data posta! 📊`,
        `¡De diez vos por preguntar! Así se maneja la plata, con info y no a ciegas. 🎯`,
        `¡Un placer! Volvé cuando quieras, la puerta (o el chat) siempre está abierta. 🚪`,
        `¡Me alegra que te sirva! Seguí cargando todo prolijo, que así los consejos son cada vez más precisos. 🧾`
      ]);
    }

    // --- Frustración / enojo del usuario (con la plata, no conmigo) ---
    if (msg.includes('estoy quebrado') || msg.includes('no tengo dinero') || msg.includes('estoy en la ruina') ||
        msg.includes('no me alcanza') || msg.includes('no llego a fin de mes') || msg.includes('estoy re gastado') ||
        msg.includes('estoy mal con la plata') || msg.includes('me estreso por la plata') || msg.includes('me angustia la plata') ||
        msg.includes('estoy ahogado') || msg.includes('no doy mas con los gastos')) {
      const r = this._resumenMes();
      return this.pickVariant('frustracion', [
        (r) => `Che, entiendo la angustia, no sos el único al que no le alcanza. Vamos a mirarlo juntos: este mes tenés un saldo de ${this._fmtMoney(r.saldo)}${r.saldo < 0 ? '. Está en rojo, pero lo primero es ver en qué categoría se te va más para cortar por ahí' : '.'} ¿Querés que veamos tu categoría más pesada?`,
        () => `Tranqui, respirá. No llegar a fin de mes le pasa a un montón de gente y no es un fracaso personal, es un tema de números que se puede ajustar. Empecemos por lo más simple: ¿tenés presupuestos cargados en tus categorías principales?`,
        () => `Sé que angustia, pero mejor mirarlo de frente que evitarlo. Si querés, arrancamos por identificar los gastos hormiga (esos chiquitos que se repiten y suman) — a veces ahí está el margen que no ves.`,
        (r) => `Ok, vamos paso a paso sin panic. ${r.cantidad > 0 ? `Con lo que tenés cargado este mes, tu saldo es ${this._fmtMoney(r.saldo)}.` : 'Todavía no tengo datos de este mes.'} Contame: ¿el problema es que entra poco, o que se te va mucho en algo puntual?`,
        () => `Va a estar bien, esto se ordena. Primero lo urgente: si hay alguna deuda con interés alto (tarjeta), esa es prioridad. Después vemos gastos que se puedan recortar sin sufrir tanto.`
      ], r);
    }

    // --- Cambio de ánimo positivo / contento con la plata ---
    if (msg.includes('estoy re bien con la plata') || msg.includes('me esta yendo bien') || msg.includes('estoy ahorrando bien') ||
        msg.includes('estoy contento con mis finanzas') || msg.includes('voy soltando el mes')) {
      const r = this._resumenMes();
      return this.pickVariant('animo_positivo', [
        (r) => `¡Qué bueno escuchar eso! ${r.cantidad > 0 && r.saldo >= 0 ? `Y los números te dan la razón: saldo positivo de ${this._fmtMoney(r.saldo)} este mes.` : ''} Aprovechá el envión para reforzar alguna meta. 🚀`,
        () => `¡Buenísimo! Cuando las cosas van bien es el mejor momento para meterle un empujón extra al fondo de emergencia o a alguna meta puntual. 💪`,
        () => `Me alegro un montón. Los meses buenos son para consolidar hábitos, no para relajar todo de golpe — pero tampoco te prives de un gustito, te lo ganaste. 🎉`
      ], r);
    }

    // --- "¿Cómo vengo / cómo ando / cómo va / cuál es mi saldo este mes?" ---
    const preguntaSaldo =
      msg.includes('como vengo') || msg.includes('como ando') || msg.includes('cual es mi saldo') ||
      msg.includes('cuanto tengo') || msg.includes('como voy este mes') || msg.includes('como estoy este mes') ||
      msg.includes('como va') || msg.includes('como vamos') || msg.includes('como venimos') ||
      msg.includes('como estamos') || msg.includes('que tal vengo') || msg.includes('que tal voy') ||
      msg.includes('todo bien') || msg.includes('novedades') || msg.includes('resumen del mes') ||
      msg.includes('mi saldo') || msg.includes('mi balance') || msg.includes('como te va') ||
      msg.includes('como venis') || msg.includes('que onda') || (msg.includes('que tal') && !msg.includes('categoria'));
    if (preguntaSaldo) {
      const r = this._resumenMes();
      if (r.cantidad === 0) {
        return this.pickVariant('saldo_sin_datos', [
          `Todavía no cargaste movimientos este mes, así que no tengo mucho para decirte. Anotá aunque sea un par de gastos y te tiro un panorama más piola. 📊`,
          `Está todo en blanco este mes, no tengo datos. Metele un par de movimientos en la pestaña **Movimientos** y volvé a preguntarme, que ahí sí te tiro números. 📝`,
          `No tengo nada cargado todavía para este mes. Ni bien anotes algo, preguntame de nuevo y te armo el resumen. 🧾`,
          `Sin movimientos cargados estoy medio ciego. Dale, cargá lo de hoy y arrancamos. 👀`
        ]);
      }
      return this.pickVariant('saldo', [
        (r) => `Este mes vas con ${this._fmtMoney(r.ingresos)} de ingresos y ${this._fmtMoney(r.egresos)} de egresos. Saldo: **${this._fmtMoney(r.saldo)}**${r.saldo < 0 ? ' (che, estás en rojo, ojo con eso) 🔴' : ' 🟢'}.`,
        (r) => `Números del mes: entraron ${this._fmtMoney(r.ingresos)}, salieron ${this._fmtMoney(r.egresos)}. Te queda un saldo de **${this._fmtMoney(r.saldo)}**${r.saldo < 0 ? '. Está negativo, convendría frenar la mano con los gastos. 😬' : '. Vas positivo, seguí así. 👍'}`,
        (r) => `Balance actual: ${this._fmtMoney(r.saldo)}${r.saldo < 0 ? ', y sí, va en negativo. Nada que no se arregle recortando alguna categoría. 🔧' : ', vas en verde. Buen laburo. ✅'} (Ingresos: ${this._fmtMoney(r.ingresos)} / Egresos: ${this._fmtMoney(r.egresos)})`,
        (r) => `Con ${r.cantidad} movimientos cargados este mes, tu saldo es de ${this._fmtMoney(r.saldo)}. ${r.saldo < 0 ? 'Te sugiero mirar la pestaña de Presupuesto para ver dónde frenar.' : 'Si querés, mandale una parte a alguna meta de ahorro.'}`,
        (r) => `Pantallazo rápido: ${r.cantidad} movimientos, ${this._fmtMoney(r.ingresos)} entraron, ${this._fmtMoney(r.egresos)} salieron, saldo ${this._fmtMoney(r.saldo)}. ${r.saldo < 0 ? 'Toca ajustar un poco.' : 'Todo prolijo por ahora.'}`,
        (r) => `${r.saldo < 0 ? 'Vamos en rojo este mes' : 'Vamos bien este mes'}: saldo de ${this._fmtMoney(r.saldo)} con ${r.cantidad} movimientos cargados hasta ahora.`
      ], r);
    }

    // --- Comparar con el mes anterior ---
    if (msg.includes('mes pasado') || msg.includes('mes anterior') || msg.includes('comparado con') || msg.includes('gaste mas o menos')) {
      const actual = this._resumenMes();
      const anterior = this._resumenMesDe(this._mesAnteriorISO());
      if (anterior.cantidad === 0) {
        return this.pickVariant('comparar_sin_datos', [
          `No tengo movimientos cargados del mes pasado, así que no puedo compararte nada. Si los tenés en algún lado, cargalos y la próxima te tiro la comparación posta. 📊`,
          `Para comparar necesito datos de los dos meses, y del anterior no tengo nada. Con lo que vayas cargando de ahora en más, esta comparación te va a servir cada vez más. 📈`
        ]);
      }
      const diferencia = actual.egresos - anterior.egresos;
      const subioBajo = diferencia > 0 ? 'gastaste más' : diferencia < 0 ? 'gastaste menos' : 'gastaste igual';
      return this.pickVariant('comparar_meses', [
        (a, ant, dif, txt) => `Comparado con el mes pasado (${this._fmtMoney(ant.egresos)} de egresos), este mes ${txt}: ${this._fmtMoney(a.egresos)}${dif !== 0 ? ` (diferencia de ${this._fmtMoney(Math.abs(dif))})` : ''}. ${dif > 0 ? 'Fijate si hubo algún gasto puntual que explique la suba.' : ''}`,
        (a, ant, dif, txt) => `Mes anterior: ${this._fmtMoney(ant.egresos)} en egresos. Este mes: ${this._fmtMoney(a.egresos)}. O sea que ${txt} ${dif !== 0 ? 'por ' + this._fmtMoney(Math.abs(dif)) : ''}.`,
        (a, ant, dif, txt) => `${dif > 0 ? '📈' : dif < 0 ? '📉' : '➡️'} ${txt.charAt(0).toUpperCase() + txt.slice(1)} respecto al mes pasado. Pasaste de ${this._fmtMoney(ant.egresos)} a ${this._fmtMoney(a.egresos)} en egresos.`,
        (a, ant) => `En ingresos: ${this._fmtMoney(ant.ingresos)} el mes pasado vs. ${this._fmtMoney(a.ingresos)} este mes. En egresos: ${this._fmtMoney(ant.egresos)} vs. ${this._fmtMoney(a.egresos)}. Sacá vos la conclusión, yo solo tiro los números. 😄`
      ], actual, anterior, diferencia, subioBajo);
    }

    // --- "¿En qué gasto más?" ---
    if (msg.includes('en que gasto mas') || msg.includes('cual es mi categoria') || msg.includes('donde se me va la plata') || msg.includes('donde se me va el dinero')) {
      const top = this._topCategoriaMes();
      if (!top) {
        return this.pickVariant('top_cat_sin_datos', [
          `No tengo egresos cargados este mes todavía, así que no puedo decirte dónde se te va la plata. Cargá tus gastos en **Movimientos** y volvé a preguntarme. 🧾`,
          `Sin movimientos no hay magia posible. Anotá tus gastos del mes y te digo exactamente dónde se te escapa la guita. 🔍`
        ]);
      }
      return this.pickVariant('top_cat', [
        (t) => `Este mes tu categoría más pesada es **${t.categoria}**, con ${this._fmtMoney(t.monto)} gastados. Si querés controlarla, mirá la pestaña de **Presupuesto** y ponele un límite. 🎯`,
        (t) => `"${t.categoria}" es donde más se te escapa la plata este mes: ${this._fmtMoney(t.monto)}. Un presupuesto en esa categoría capaz te ordena un poco. 📌`,
        (t) => `El podio de gastos lo gana **${t.categoria}** con ${this._fmtMoney(t.monto)}. No digo que la elimines, pero vale la pena mirarla de cerca. 👀`,
        (t) => `Ganadora indiscutida del mes: **${t.categoria}**, con ${this._fmtMoney(t.monto)}. ¿Le ponemos un presupuesto para frenarla un poco?`,
        (t) => `Si tuviera que apostar dónde se te va la plata, ya no hace falta apostar: es **${t.categoria}**, con ${this._fmtMoney(t.monto)} este mes.`
      ], top);
    }

    // --- Gastos hormiga ---
    if (msg.includes('gasto hormiga') || msg.includes('gastos hormiga') || msg.includes('gastos chiquitos') || msg.includes('en que se me va de a poquito')) {
      const h = this._gastosHormigaMes();
      if (!h) {
        return this.pickVariant('hormiga_sin_datos', [
          `No detecto un patrón claro de gasto hormiga este mes (necesito varios movimientos chicos y repetidos en una misma categoría para poder decirte algo). Seguí cargando y en unas semanas te lo puedo confirmar. 🐜`,
          `Por ahora no encuentro nada sospechoso de gasto hormiga. Buena señal, o simplemente todavía faltan datos — seguí cargando y controlamos. 🐜`
        ]);
      }
      return this.pickVariant('hormiga', [
        (h) => `Encontré un candidato a gasto hormiga: **${h.cat}**, con ${h.cantidad} movimientos este mes que suman ${this._fmtMoney(h.total)} (un promedio de ${this._fmtMoney(h.promedio)} cada vez). Individualmente parecen nada, pero juntos pesan. 🐜`,
        (h) => `Ojo con **${h.cat}**: la repetiste ${h.cantidad} veces este mes y ya acumula ${this._fmtMoney(h.total)}. Clásico gasto hormiga — no hace falta cortarlo del todo, pero controlarlo un poco no viene mal.`,
        (h) => `Detecté hormigas en **${h.cat}**: ${h.cantidad} movimientos chiquitos que ya suman ${this._fmtMoney(h.total)}. Si le bajás un cambio a la mitad, ya notás la diferencia a fin de mes.`
      ], h);
    }

    // --- Presupuesto ---
    if (msg.includes('presupuesto') || msg.includes('limite de gasto')) {
      const estado = this._estadoPresupuestos();
      if (estado.length === 0) {
        return this.pickVariant('presupuesto_sin_datos', [
          `No tenés presupuestos cargados todavía. Andá a la pestaña **Presupuesto** y ponele un límite mensual a tus categorías de gasto más importantes — así te aviso cuando te estés por pasar. 🎯`,
          `Sin presupuestos armados no tengo mucho para chequear. Te recomiendo empezar por 2 o 3 categorías donde más gastás, y de ahí vamos afinando. 🎯`,
          `Todavía no armaste presupuestos. Con uno solo en tu categoría más pesada ya empezás a ver diferencia — no hace falta armar los 20 de una. 🎯`
        ]);
      }
      const enRiesgo = estado.filter(e => e.pct >= 0.8).sort((a, b) => b.pct - a.pct);
      if (enRiesgo.length === 0) {
        return this.pickVariant('presupuesto_ok', [
          `Vas bien con tus presupuestos, ninguno está por pasarse del límite todavía. Seguí así. 💪`,
          `Todo en verde por el momento con tus presupuestos. Ni una categoría al límite. 🟢`,
          `Presupuestos bajo control, ninguno pasó el 80%. Buen manejo del mes. ✅`
        ]);
      }
      const detalle = enRiesgo.map(e => `**${e.cat}**: ${Math.round(e.pct * 100)}% usado`).join(', ');
      return this.pickVariant('presupuesto_riesgo', [
        (d) => `Ojo con estos presupuestos que están al límite o pasados: ${d}. Capaz conviene frenar un poco el gasto ahí hasta fin de mes. ⚠️`,
        (d) => `Che, tenés categorías complicadas con el presupuesto: ${d}. Nada grave, pero vigilalas de acá a fin de mes. 👀`,
        (d) => `Alerta amarilla en: ${d}. Todavía estás a tiempo de frenar antes de que se pase del todo. 🟡`,
        (d) => `Estas categorías ya están al límite o pasadas: ${d}. Si hay margen, movele el foco a otra categoría por lo que queda de mes.`
      ], detalle);
    }

    // --- Metas / ahorro para algo puntual ---
    if (msg.includes('meta') || msg.includes('objetivo de ahorro') || msg.includes('ahorro para')) {
      const misMetas = this._metasDelModo();
      if (misMetas.length === 0) {
        return this.pickVariant('metas_sin_datos', [
          `No tenés metas de ahorro creadas. Andá a la pestaña **Metas** y armá una (vacaciones, un auto, lo que sea) — ayuda un montón a mantener el rumbo. ⭐`,
          `Todavía no armaste ninguna meta. Ponerle nombre y número a lo que querés ahorrar (tipo "viaje a Bariloche: $500.000") ayuda muchísimo más que "ahorrar en general". 🎯`,
          `Cero metas por ahora. Aunque sea chica, armá una — el cerebro responde mejor a un objetivo concreto que a "ahorrar porque sí". ⭐`
        ]);
      }
      const detalle = misMetas.map(m => {
        const pct = Math.min(Math.round((m.ahorrado / m.objetivo) * 100), 100);
        return `**${m.nombre}**: ${pct}%`;
      }).join(', ');
      return this.pickVariant('metas', [
        (d) => `Así vas con tus metas: ${d}. Metele que cada peso que sumás cuenta. 💪`,
        (d) => `Tu progreso de metas: ${d}. Si podés destinar un poco más este mes, andá a la meta y sumale un ahorro. ⭐`,
        (d) => `Estado de tus metas: ${d}. Nada mal, che. Seguí sumando de a poquito que se nota. 📈`,
        (d) => `Metas al día de hoy: ${d}. Un aporte chico pero constante rinde más que uno grande esporádico.`
      ], detalle);
    }

    // --- Tasa de ahorro ---
    if (msg.includes('tasa de ahorro') || msg.includes('cuanto ahorro') || msg.includes('estoy ahorrando')) {
      const tasa = this._tasaAhorroMes();
      if (tasa === null) {
        return this.pickVariant('tasa_sin_datos', [
          `No tengo ingresos cargados este mes, así que no puedo calcular tu tasa de ahorro. Cargá tus ingresos en **Movimientos** y probamos de nuevo. 📊`
        ]);
      }
      return this.pickVariant('tasa', [
        (t) => `Tu tasa de ahorro este mes es del **${t}%** (o sea, de cada $100 que entran, estás guardando $${t}). Como referencia general, arriba del 20% ya es una buena base. 📈`,
        (t) => `Este mes estás ahorrando un **${t}%** de lo que ingresa. ${t >= 20 ? 'Está bueno ese número, seguí así.' : 'Si podés estirarlo un poco más, mejor, pero no te agobies.'} 💡`,
        (t) => `Tasa de ahorro actual: **${t}%**. ${t < 0 ? 'Ojo que está en negativo, significa que estás gastando más de lo que ganás este mes.' : t < 10 ? 'Es baja pero no es cero, algo es algo.' : 'Nivel bastante prolijo, che.'}`,
        (t) => `${t}% es tu tasa de ahorro de este mes. ${t >= 30 ? 'Ese número es de otro nivel, felicitaciones.' : t >= 0 ? 'Vas en positivo, eso ya es una buena base para construir.' : 'Está en rojo — no es el fin del mundo, pero conviene mirarlo antes de que se haga costumbre.'}`
      ], tasa);
    }

    // --- Deudas / tarjeta de crédito ---
    if (msg.includes('deuda') || msg.includes('tarjeta de credito') || msg.includes('debo') || msg.includes('cuotas') || msg.includes('estoy endeudado')) {
      return this.pickVariant('deudas', [
        `Con deudas y tarjeta, la regla de oro es: primero pagá la que tenga la tasa de interés más alta (generalmente la tarjeta de crédito), después las demás. Si podés pagar el total del resumen y no solo el mínimo, siempre conviene — el mínimo te come de a poco con intereses. No soy asesor financiero, esto es orientativo. 💳`,
        `Si tenés varias deudas, ordenalas por tasa de interés y atacá primero la más cara. Y ojo con acumular cuotas nuevas mientras estás pagando otras — ahí es donde el presupuesto se te desarma. Puedo ayudarte a ver cuánto te está pesando cada categoría si me contás más. 📋`,
        `Truco simple: anotá todas tus deudas con su monto y tasa. Después decidís entre "bola de nieve" (pagar primero la más chica para sentir avance rápido) o "avalancha" (pagar primero la de mayor interés, que ahorra más plata). Las dos funcionan, elegí la que te mantenga motivado. ❄️`,
        `Mientras estés pagando una deuda cara, tratá de no sumar cuotas nuevas aunque la tentación exista. Cargá esos gastos en Movimientos igual, así vemos juntos el impacto real en tu presupuesto.`
      ]);
    }

    // --- Fondo de emergencia ---
    if (msg.includes('fondo de emergencia') || msg.includes('ahorro para emergencias') || msg.includes('colchon financiero')) {
      return this.pickVariant('fondo_emergencia', [
        `El fondo de emergencia clásico es de 3 a 6 meses de tus gastos fijos, guardado en algo líquido y accesible (no en algo que tarde semanas en poder retirarse). Si no lo tenés armado, conviene priorizarlo antes que otras metas más "divertidas". 🛟`,
        `Un fondo de emergencia te cubre imprevistos (arreglo del auto, algo de salud, quedarte sin laburo un tiempo) sin que tengas que endeudarte. Podés armarlo como una meta más en la pestaña **Metas** y aportarle un poquito cada mes. 🛟`,
        `Si no sabés por dónde arrancar: calculá tus gastos fijos de un mes típico (alquiler, servicios, comida) y multiplicalo por 3. Esa es tu primera meta de fondo de emergencia, aunque tarde un año en llenarse.`
      ]);
    }

    // --- Ingresos extra / cómo ganar más ---
    if (msg.includes('ingreso extra') || msg.includes('plata extra') || msg.includes('ganar mas dinero') || msg.includes('otro ingreso')) {
      return this.pickVariant('ingresos_extra', [
        `Para eso ya me meto más en terreno de asesoramiento de carrera que financiero puro, así que te tiro solo lo general: diversificar ingresos (algo freelance, vender algo que no usás, un side hustle) ayuda, pero lo más rápido de controlar siempre es el lado de los gastos. Si querés, vemos juntos dónde hay margen para recortar mientras tanto. 💼`,
        `No puedo darte un plan de "cómo ganar plata extra" específico, pero sí puedo ayudarte a ver cuánto necesitás exactamente por mes para cubrir el déficit, así sabés el objetivo concreto que perseguís. ¿Querés que lo calculemos?`,
        `Una idea simple: revisá qué cosas tenés sin usar (ropa, electrónica, muebles) y vendelas. No cambia tu vida, pero te da un empujón rápido mientras pensás algo más de fondo.`
      ]);
    }

    // --- Freelance / ingreso irregular ---
    if (msg.includes('freelance') || msg.includes('trabajo independiente') || msg.includes('ingreso irregular') || msg.includes('cobro variable') || msg.includes('no se cuanto voy a cobrar')) {
      const vol = this._volatilidadIngresos();
      return this.pickVariant('freelance', [
        () => `Con ingresos variables, lo que mejor funciona es basar tu presupuesto en el mes MÁS BAJO de los últimos 3-6 meses, no en el promedio ni en el mejor mes. Todo lo que entra de más en los meses buenos, va directo a un fondo "colchón" para los meses flacos. 📊`,
        (v) => v
          ? `Mirando tus últimos meses con datos, tus ingresos variaron entre ${this._fmtMoney(v.min)} y ${this._fmtMoney(v.max)}${v.variacionPct !== null ? ` (una variación del ${v.variacionPct}%)` : ''}. Con esa volatilidad, armar un colchón de 3-6 meses es todavía más importante que con un sueldo fijo.`
          : `Con ingreso freelance, armar un colchón de 3 a 6 meses de gastos fijos es incluso más importante que con sueldo fijo — te da margen para los meses flacos sin entrar en pánico ni en deuda.`,
        () => `Un truco que usan muchos freelancers: apenas cobrás, separá un % fijo para impuestos/aportes ANTES de gastar nada. Así no te agarra desprevenido cuando toca pagar.`
      ], vol);
    }

    // --- Alquiler / expensas / impuestos ---
    if (msg.includes('alquiler') || msg.includes('expensas') || msg.includes('impuestos') || msg.includes('impuesto')) {
      return this.pickVariant('alquiler_impuestos', [
        `Los gastos fijos como alquiler, expensas e impuestos suelen ser lo primero que hay que cubrir en el presupuesto, antes que cualquier gasto variable. Si querés controlarlos mejor, marcalos como recurrentes en **Movimientos** así no te olvidás ni tenés que cargarlos a mano cada mes. 🏠`,
        `Como referencia general (no es una regla fija), se suele recomendar que el alquiler no supere el 30% de tus ingresos. Si estás bastante arriba de eso, vale la pena revisar el resto del presupuesto para compensar. 🏠`,
        `Para impuestos y expensas que suelen variar de mes a mes, es útil ponerles un presupuesto un poco más alto que el promedio, así no te agarran de sorpresa los meses que suben más de lo esperado.`
      ]);
    }

    // --- Vacaciones / viajes ---
    if (msg.includes('vacaciones') || msg.includes('viaje') || msg.includes('viajar')) {
      return this.pickVariant('vacaciones', [
        `Para vacaciones, lo mejor es armar una meta específica con el monto que necesitás y la fecha del viaje — así podés ver cuánto te falta ahorrar por mes para llegar sin apretar el resto del presupuesto. ¿Querés que armemos una meta de viaje? ✈️`,
        `Un tip: separá el presupuesto de vacaciones en categorías (pasajes, alojamiento, comida, actividades) y cargá una meta por el total. Así evitás la sorpresa de "gasté todo en el vuelo y me quedé corto para el resto". 🧳`,
        `Si las vacaciones son algo que repetís todos los años, armar una meta que se recargue automáticamente (aportando un poco cada mes) hace que llegues sin sentir el golpe de una vez. ☀️`
      ]);
    }

    // --- Sueldo / aguinaldo / cobro ---
    if (msg.includes('cobre el sueldo') || msg.includes('me pagaron') || msg.includes('aguinaldo') || msg.includes('cobre el aguinaldo') || msg.includes('acabo de cobrar')) {
      return this.pickVariant('cobro_sueldo', [
        `¡Buena noticia! Antes de que se te diluya en gastos del día a día, te sugiero: (1) separá lo del alquiler/gastos fijos, (2) mandá algo a una meta o al fondo de emergencia, y recién con lo que sobra, gastos variables. No cargues todavía el movimiento a Otros — buscá la categoría correcta que corresponda. 💰`,
        `¡Genial! El aguinaldo o un cobro extra es la mejor oportunidad del año para meterle un empujón fuerte a una meta o al fondo de emergencia, en vez de que se diluya en el día a día. ¿Cargamos el ingreso primero?`,
        `Momento clave: apenas entra la plata es cuando más tentador es gastarla toda. Si separás aunque sea un 20% para ahorro apenas cobrás, el resto lo podés gastar sin culpa.`
      ]);
    }

    // --- Gastos compartidos / con pareja o roommates ---
    if (msg.includes('gastos compartidos') || msg.includes('dividir gastos') || msg.includes('con mi pareja') || msg.includes('con mi novia') || msg.includes('con mi novio') || msg.includes('con roommates') || msg.includes('con mis compañeros de depto')) {
      return this.pickVariant('gastos_compartidos', [
        `Para gastos compartidos, lo más simple es acordar un método fijo: 50/50, proporcional a ingresos, o un pozo común para gastos de la casa donde cada uno aporta un monto fijo. Lo importante es que sea claro y ambos lo respeten, no tanto cuál elijan. 🤝`,
        `Si compartís gastos, podés usar el modo "Laboral" o crear categorías específicas para diferenciarlos de tus gastos 100% personales — así el presupuesto no se te mezcla y sabés bien qué es tuyo y qué es compartido.`,
        `Una idea que evita fricciones: revisiones mensuales cortas de "cómo venimos" con quien compartís gastos, en vez de esperar a que algo se acumule y se vuelva tema. La transparencia con los números ayuda más que cualquier acuerdo verbal suelto.`
      ]);
    }

    // --- Inversiones (educativo general, sin recomendar activos puntuales) ---
    if (msg.includes('invertir') || msg.includes('inversion') || msg.includes('donde pongo la plata') || msg.includes('plazo fijo') || msg.includes('donde conviene poner los ahorros')) {
      return this.pickVariant('inversiones', [
        `No te puedo (ni debo) recomendar dónde invertir específicamente — eso depende de tu situación, plazos y tolerancia al riesgo, y ahí sí conviene un asesor financiero real. Lo que sí te digo: antes de pensar en invertir, aseguráte de tener el fondo de emergencia armado y las deudas caras pagadas. Eso rinde "seguro" antes que cualquier inversión. 📊`,
        `Regla general antes de invertir: primero fondo de emergencia, después deudas con interés alto, y recién ahí plata que no vayas a necesitar en el corto plazo para pensar en invertir. El orden importa más que el instrumento que elijas. No es asesoramiento financiero formal, es orientación general.`,
        `Sobre inversiones puntuales (plazo fijo, dólares, lo que sea) no doy recomendaciones específicas porque depende de tu momento y de la coyuntura. Lo que sí puedo ayudarte es a ver cuánto te queda disponible por mes para destinar a eso, una vez cubierto lo esencial.`
      ]);
    }

    // --- Motivación / celebración de logros ---
    if (msg.includes('logre mi meta') || msg.includes('llegue a la meta') || msg.includes('complete la meta') || msg.includes('cumpli mi objetivo')) {
      return this.pickVariant('celebracion_meta', [
        `¡Eso, felicitaciones! 🎉 Cumplir una meta de ahorro no es poca cosa, requiere constancia. Disfrutala, y cuando quieras arrancamos con la próxima.`,
        `¡Increíble! 🏆 Ese tipo de logros vale la pena festejarlos. ¿Armamos la próxima meta o te tomás un respiro primero?`,
        `¡Grande! 💪 Guardate esta sensación, sirve de motivación para la próxima vez que el ahorro se ponga cuesta arriba.`
      ]);
    }

    // --- Preguntas sobre el propio chat / cómo funciona ---
    if (msg.includes('como funcionas') || msg.includes('de donde sacas los datos') || msg.includes('mis datos estan seguros') || msg.includes('guardas mis datos')) {
      return this.pickVariant('como_funciono', [
        `Leo directo los movimientos, presupuestos y metas que vos cargaste en la app — no invento números ni uso datos externos. Todo lo que te digo sale de lo que ya registraste acá. 🔍`,
        `Trabajo solo con lo que tenés cargado en Alkaranta: tus movimientos, presupuestos y metas. Nada de datos externos ni de otras cuentas. Si algo no está cargado, simplemente no lo sé.`
      ]);
    }

    // --- Consejos generales de ahorro / finanzas personales (educativo, sin recomendar activos puntuales) ---
    if (msg.includes('consejo') || msg.includes('tips') || msg.includes('como ahorro') || msg.includes('como ahorrar') || msg.includes('que hago con la plata') || msg.includes('que hago con el dinero')) {
      return this.pickVariant('consejos', [
        `Un par de ideas clásicas que funcionan: (1) separá el ahorro apenas cobrás, no esperes a fin de mes; (2) armate un fondo de emergencia de 3-6 meses de gastos antes de pensar en otra cosa; (3) las suscripciones y el delivery son los que más se comen el presupuesto sin que te des cuenta, revisalos. Ojo que no soy asesor financiero, esto es orientativo nomás. 💡`,
        `Tips rápidos: registrá TODO (hasta el cafecito), ponele presupuesto a las categorías que más se te van de las manos, y si te sobra algo a fin de mes, mandalo directo a una meta de ahorro para que no se diluya en gastos hormiga. No es asesoramiento financiero formal, pero son hábitos que funcionan. 🐜`,
        `La regla 50/30/20 es un buen punto de partida: 50% necesidades, 30% gustos, 20% ahorro. No es una ley, es una referencia para reacomodar si sentís que todo se te va sin saber en qué. 📐`,
        `Algo simple que suma: revisá tus suscripciones cada 3 meses. Casi siempre hay alguna que ya ni usás y te sigue debitando solita. 🔍`,
        `Truco de un solo paso: cada vez que vayas a hacer una compra grande, esperá 24-48hs antes de confirmarla. La mayoría de los "gastos impulsivos" pierden fuerza con esa pausa. ⏳`,
        `Si sentís que "no sabés en qué se te va la plata", el primer paso siempre es el mismo: cargar TODOS los movimientos durante un mes entero, sin filtrar nada. Recién ahí el panorama se ve de verdad.`
      ]);
    }

    // --- Preguntas de economía general / inflación / dólar (sin dar cifras específicas que se desactualizan) ---
    if (msg.includes('inflacion') || msg.includes('dolar') || msg.includes('economia')) {
      return this.pickVariant('economia_general', [
        `Esa es una pregunta más de coyuntura y no tengo datos en vivo del mercado, así que no te voy a tirar un número que capaz ya cambió. Lo que sí te puedo ayudar es a ver el impacto en TU bolsillo: si la inflación te preocupa, es buena idea revisar tus categorías de gasto seguido y ajustar tu presupuesto mes a mes, no una vez al año. 📊`,
        `No manejo cotizaciones ni datos económicos en tiempo real, así que para eso mejor una fuente actualizada. Lo que puedo hacer es ayudarte a que tu presupuesto se adapte rápido a los cambios de precios, revisando gastos por categoría seguido. 💬`,
        `Para cifras actuales de dólar o inflación necesitás una fuente en vivo, yo no tengo eso. Lo que sí te puedo dar es una mano para que, sea cual sea el contexto, tu presupuesto se vaya ajustando con datos reales de tus propios gastos.`
      ]);
    }

    // --- Comparar modo personal vs. laboral ---
    if ((msg.includes('personal') && msg.includes('laboral')) || msg.includes('cuentas separadas') || msg.includes('diferencia entre mis dos modos')) {
      const p = this._resumenMesDe(this._mesActualISO());
      return this.pickVariant('personal_vs_laboral', [
        () => `El modo Personal y el modo Laboral llevan cuentas totalmente separadas, así que puedo darte el resumen de cada uno por separado, pero no un total combinado automático. ¿Querés que te tire el saldo del modo en el que estás parado ahora?`,
        () => `Separar personal y laboral está bueno para no mezclar plata que "no es tuya" (como fondos de un negocio) con tus gastos de todos los días. Cambiá de modo arriba para ver el resumen de cada uno.`
      ], p);
    }

    // --- Movimientos recurrentes ---
    if (msg.includes('recurrente') || msg.includes('automatico')) {
      return this.pickVariant('recurrentes', [
        `Si tenés un gasto o ingreso que se repite (alquiler, sueldo, suscripciones), marcá "Repetir automáticamente" cuando lo cargues en **Movimientos** — así no tenés que tipearlo cada mes. ⚙️`,
        `Los movimientos recurrentes se generan solos cada mes/quincena/semana según la frecuencia que elijas. Podés pausarlos o eliminarlos desde el ícono de recurrentes cuando quieras. 🔁`
      ]);
    }

    // --- Exportar ---
    if (msg.includes('exportar') || msg.includes('csv') || msg.includes('descargar')) {
      return this.pickVariant('exportar', [
        `Podés bajarte todos tus movimientos en CSV con el botón de exportar. Sirve para llevarlo a Excel o compartirlo con tu contador. 📤`,
        `El botón de exportar te arma un CSV con fecha, tipo, categoría, monto y descripción de todos tus movimientos del modo actual. Ideal para un análisis más a fondo en una planilla. 📊`
      ]);
    }

    // --- Ayuda / qué podés hacer / comandos ---
    if (msg.includes('ayuda') || msg.includes('que podes hacer') || msg.includes('que sabes hacer') || msg.includes('comandos') || msg.includes('que puedo preguntarte')) {
      return this.pickVariant('ayuda', [
        `Te puedo ayudar con cosas como: "¿cómo vengo este mes?", "¿en qué gasto más?", "¿cómo van mis presupuestos?", "¿cómo van mis metas?", "¿cuál es mi tasa de ahorro?", "dame consejos para ahorrar", o comparar con el mes pasado. Preguntame como si le hablaras a un amigo que sabe de números. 💬`,
        `Algunas ideas de qué preguntarme: resumen del mes, gastos hormiga, estado de presupuestos, progreso de metas, tasa de ahorro, deudas y tarjeta, fondo de emergencia, vacaciones, o simplemente "dame un consejo". Tirame cualquiera de esas. 🗒️`
      ]);
    }

    // --- Quién sos / qué sos ---
    if (msg.includes('quien sos') || msg.includes('que sos') || msg.includes('sos un bot') || msg.includes('sos una ia') || msg.includes('sos inteligencia artificial')) {
      return this.pickVariant('quien_sos', [
        `Soy el asistente financiero de Alkaranta, hecho para leer tus propios movimientos, presupuestos y metas y contarte cómo venís — sin vueltas y con algo de humor. No reemplazo a un asesor financiero de verdad, pero para el día a día te doy una mano. 🤖💰`
      ]);
    }

    // --- Chiste / buen humor ---
    if (msg.includes('contame un chiste') || msg.includes('hace un chiste') || msg.includes('chiste de plata')) {
      return this.pickVariant('chiste', [
        `¿Por qué el peso argentino no va al gimnasio? Porque ya se devalúa solo. 😅`,
        `Che, ¿sabés cuál es el ahorro más difícil de lograr? El de "voy a ahorrar el mes que viene". Ese nunca llega. 😂`,
        `Mi chiste favorito de finanzas: alguien que dice "esto es una inversión" justo antes de comprar algo que no necesita. 🤡`,
        `¿Cuál es el animal favorito de las finanzas personales? La hormiga, pero por los gastos, no por lo trabajadora. 🐜`,
        `Fin de mes es como una relación tóxica: siempre vuelve, y siempre te deja peor de lo que esperabas. 💔💸`
      ]);
    }

    // --- Default ---
    return this.pickVariant('default', [
      `Uy, esa no la agarré del todo. Preguntame por ejemplo "¿cómo vengo este mes?", "¿en qué gasto más?" o "dame consejos para ahorrar" y te tiro posta. 💬`,
      `No estoy seguro de haber entendido bien. Puedo contarte de tu saldo del mes, tus presupuestos, tus metas de ahorro o darte tips generales de finanzas — probá con eso. 😉`,
      `No te agarré la onda a esa. Si querés un pantallazo general, preguntame "resumen del mes" y arrancamos de ahí. 📋`,
      `Mmm, esa pregunta me la banco pero no la entendí. Probá algo como "¿cómo van mis metas?" o "¿tengo algún gasto hormiga?". 🐜`,
      `Esa se me escapó un poco. Escribime "ayuda" y te tiro una lista de cosas que sí puedo responder. 🙋`
    ]);
  }
};

// ==========================================================================
// NOTAS DE INTEGRACIÓN (leer antes de pegar en producción)
// ==========================================================================
// Este archivo SOLO define el "cerebro" (FinanceChatApp.getBotResponse).
// Para que aparezca como una pestaña de chat en tu app, necesitás:
//
// 1. Un botón más en tu #bottomNav (junto a Inicio/Movimientos/etc.) que
//    llame a cambiarTab('chat', this). mmm
// 2. Una sección nueva <div class="tab" id="sec-chat"> con el scroll de
//    mensajes y el input, en el mismo estilo "glass" que ya usás.
// 3. Un par de funciones de UI (equivalentes a UI.sendChat() de Nutrio)
//    que llamen a FinanceChatApp.getBotResponse(mensaje) y pinten las
//    burbujas.
//
// No tengo tu index.html/CSS todavía (colores --emerald/--red, clase
// .glass, cómo está armado el "blob" del bottomNav), así que preferí
// dejarte el cerebro ya funcionando y pedirte esos archivos para
// terminar de pegar la parte visual sin
