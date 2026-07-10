// ==========================================================================
// FINANCE CHAT — "el Nutrio de las finanzas" para Alkaranta
// Mismo tono, mismas mañas (lunfardo, humor, che), pero la inteligencia
// ahora es 100% financiera: lee tus propios movimientos, presupuestos y
// metas (las variables globales que ya existen en script.js) para darte
// respuestas que hablan de VOS, no genéricas.
//
// Cómo integrarlo:
// 1) Guardá este archivo como js/financeChat.js
// 2) Cargalo en tu HTML después de script.js:
//      <script src="js/financeChat.js"></script>
// 3) Agregá una sección de chat y un botón de nav (ver notas al final del
//    archivo y el mensaje que te escribí en el chat) — como no tengo tu
//    index.html/CSS todavía, dejé la UI en un bloque aparte para que la
//    puedas pegar y ajustar a tus clases/colores reales.
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
      [/\bplata\b|\bguita\b|\bmangos\b|\bmanguitos\b/g, 'dinero'],
      [/\blaburo\b|\blaburando\b/g, 'trabajo'],
      [/\bestoy palo\b|\bestoy seco\b|\bestoy quebrado\b/g, 'no tengo dinero'],
      [/\bme funde\b|\bme fundi\b/g, 'gasté de más'],
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

  _fmtMoney(n) {
    return '$' + Math.round(n).toLocaleString('es-AR');
  },

  _resumenMes() {
    const mes = this._mesActualISO();
    const delMes = movimientos.filter(m => pertenece(m) && m.fecha && m.fecha.startsWith(mes));
    const ingresos = delMes.filter(m => m.tipo === 'Ingreso').reduce((s, m) => s + m.monto, 0);
    const egresos = delMes.filter(m => m.tipo === 'Egreso').reduce((s, m) => s + m.monto, 0);
    return { ingresos, egresos, saldo: ingresos - egresos, cantidad: delMes.length };
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
      /\bhasta manana\b/.test(msg) || /\bme voy\b/.test(msg) || /\badios\b/.test(msg) || /\bbye\b/.test(msg);
    if (esDespedida) {
      return this.pickVariant('despedida', [
        (n) => `¡Chau${n}! Que la plata te rinda. Nos vemos en la próxima. 👋`,
        (n) => `¡Nos vemos${n}! Cualquier duda de guita, ya sabés dónde encontrarme. 💸`,
        (n) => `¡Dale${n}, cuidate! No te olvides de cargar los movimientos de hoy. 📊`
      ], nameSuffix);
    }

    // --- Saludos ---
    if (msg.includes('hola') || msg.includes('buen') || msg.includes('que onda') || msg.includes('como andas')) {
      return this.pickVariant('saludo', [
        (n) => `¡Qué hacés${n}! Contame, ¿querés ver cómo venís este mes, hablar de tu presupuesto, o tenés alguna duda de finanzas en general? 💰`,
        (n) => `¡Hola${n}! Acá ando, con la calculadora lista. ¿En qué te ayudo con tu plata hoy?`,
        (n) => `¡Buenas${n}! ¿Charlamos de números o tenés alguna duda de economía en general?`
      ], nameSuffix);
    }

    // --- Agradecimientos ---
    if (msg.includes('gracias') || msg.includes('genial') || msg.includes('joya') || msg.includes('de diez')) {
      return this.pickVariant('gracias', [
        `¡De una! Cualquier cosita de tus números, acá ando. 🙌`,
        `¡Buenísimo, me alegro que sirva! Seguimos viendo cómo te va con la plata. 😄`
      ]);
    }

    // --- "¿Cómo vengo / cómo ando / cuál es mi saldo este mes?" ---
    const preguntaSaldo =
      msg.includes('como vengo') || msg.includes('como ando') || msg.includes('cual es mi saldo') ||
      msg.includes('cuanto tengo') || msg.includes('como voy este mes') || msg.includes('como estoy este mes');
    if (preguntaSaldo) {
      const r = this._resumenMes();
      if (r.cantidad === 0) {
        return this.pickVariant('saldo_sin_datos', [
          `Todavía no cargaste movimientos este mes, así que no tengo mucho para decirte. Anotá aunque sea un par de gastos y te tiro un panorama más piola. 📊`
        ]);
      }
      return this.pickVariant('saldo', [
        (r) => `Este mes vas con ${this._fmtMoney(r.ingresos)} de ingresos y ${this._fmtMoney(r.egresos)} de egresos. Saldo: **${this._fmtMoney(r.saldo)}**${r.saldo < 0 ? ' (che, estás en rojo, ojo con eso) 🔴' : ' 🟢'}.`,
        (r) => `Números del mes: entraron ${this._fmtMoney(r.ingresos)}, salieron ${this._fmtMoney(r.egresos)}. Te queda un saldo de **${this._fmtMoney(r.saldo)}**${r.saldo < 0 ? '. Está negativo, convendría frenar la mano con los gastos. 😬' : '. Vas positivo, seguí así. 👍'}`
      ], r);
    }

    // --- "¿En qué gasto más?" ---
    if (msg.includes('en que gasto mas') || msg.includes('cual es mi categoria') || msg.includes('donde se me va la plata') || msg.includes('donde se me va el dinero')) {
      const top = this._topCategoriaMes();
      if (!top) {
        return this.pickVariant('top_cat_sin_datos', [
          `No tengo egresos cargados este mes todavía, así que no puedo decirte dónde se te va la plata. Cargá tus gastos en **Movimientos** y volvé a preguntarme. 🧾`
        ]);
      }
      return this.pickVariant('top_cat', [
        (t) => `Este mes tu categoría más pesada es **${t.categoria}**, con ${this._fmtMoney(t.monto)} gastados. Si querés controlarla, mirá la pestaña de **Presupuesto** y ponele un límite. 🎯`,
        (t) => `"${t.categoria}" es donde más se te escapa la plata este mes: ${this._fmtMoney(t.monto)}. Un presupuesto en esa categoría capaz te ordena un poco. 📌`
      ], top);
    }

    // --- Presupuesto ---
    if (msg.includes('presupuesto') || msg.includes('limite de gasto')) {
      const estado = this._estadoPresupuestos();
      if (estado.length === 0) {
        return this.pickVariant('presupuesto_sin_datos', [
          `No tenés presupuestos cargados todavía. Andá a la pestaña **Presupuesto** y ponele un límite mensual a tus categorías de gasto más importantes — así te aviso cuando te estés por pasar. 🎯`
        ]);
      }
      const enRiesgo = estado.filter(e => e.pct >= 0.8).sort((a, b) => b.pct - a.pct);
      if (enRiesgo.length === 0) {
        return this.pickVariant('presupuesto_ok', [
          `Vas bien con tus presupuestos, ninguno está por pasarse del límite todavía. Seguí así. 💪`
        ]);
      }
      const detalle = enRiesgo.map(e => `**${e.cat}**: ${Math.round(e.pct * 100)}% usado`).join(', ');
      return this.pickVariant('presupuesto_riesgo', [
        (d) => `Ojo con estos presupuestos que están al límite o pasados: ${d}. Capaz conviene frenar un poco el gasto ahí hasta fin de mes. ⚠️`,
        (d) => `Che, tenés categorías complicadas con el presupuesto: ${d}. Nada grave, pero vigilalas de acá a fin de mes. 👀`
      ], detalle);
    }

    // --- Metas / ahorro para algo puntual ---
    if (msg.includes('meta') || msg.includes('objetivo de ahorro') || msg.includes('ahorro para')) {
      const misMetas = this._metasDelModo();
      if (misMetas.length === 0) {
        return this.pickVariant('metas_sin_datos', [
          `No tenés metas de ahorro creadas. Andá a la pestaña **Metas** y armá una (vacaciones, un auto, lo que sea) — ayuda un montón a mantener el rumbo. ⭐`
        ]);
      }
      const detalle = misMetas.map(m => {
        const pct = Math.min(Math.round((m.ahorrado / m.objetivo) * 100), 100);
        return `**${m.nombre}**: ${pct}%`;
      }).join(', ');
      return this.pickVariant('metas', [
        (d) => `Así vas con tus metas: ${d}. Metele que cada peso que sumás cuenta. 💪`,
        (d) => `Tu progreso de metas: ${d}. Si podés destinar un poco más este mes, andá a la meta y sumale un ahorro. ⭐`
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
        (t) => `Este mes estás ahorrando un **${t}%** de lo que ingresa. ${t >= 20 ? 'Está bueno ese número, seguí así.' : 'Si podés estirarlo un poco más, mejor, pero no te agobies.'} 💡`
      ], tasa);
    }

    // --- Consejos generales de ahorro / finanzas personales (educativo, sin recomendar activos puntuales) ---
    if (msg.includes('consejo') || msg.includes('tips') || msg.includes('como ahorro') || msg.includes('como ahorrar') || msg.includes('que hago con la plata') || msg.includes('que hago con el dinero')) {
      return this.pickVariant('consejos', [
        `Un par de ideas clásicas que funcionan: (1) separá el ahorro apenas cobrás, no esperes a fin de mes; (2) armate un fondo de emergencia de 3-6 meses de gastos antes de pensar en otra cosa; (3) las suscripciones y el delivery son los que más se comen el presupuesto sin que te des cuenta, revisalos. Ojo que no soy asesor financiero, esto es orientativo nomás. 💡`,
        `Tips rápidos: registrá TODO (hasta el cafecito), ponele presupuesto a las categorías que más se te van de las manos, y si te sobra algo a fin de mes, mandalo directo a una meta de ahorro para que no se diluya en gastos hormiga. No es asesoramiento financiero formal, pero son hábitos que funcionan. 🐜`
      ]);
    }

    // --- Preguntas de economía general / inflación / dólar (sin dar cifras específicas que se desactualizan) ---
    if (msg.includes('inflacion') || msg.includes('dolar') || msg.includes('economia')) {
      return this.pickVariant('economia_general', [
        `Esa es una pregunta más de coyuntura y no tengo datos en vivo del mercado, así que no te voy a tirar un número que capaz ya cambió. Lo que sí te puedo ayudar es a ver el impacto en TU bolsillo: si la inflación te preocupa, es buena idea revisar tus categorías de gasto seguido y ajustar tu presupuesto mes a mes, no una vez al año. 📊`,
        `No manejo cotizaciones ni datos económicos en tiempo real, así que para eso mejor una fuente actualizada. Lo que puedo hacer es ayudarte a que tu presupuesto se adapte rápido a los cambios de precios, revisando gastos por categoría seguido. 💬`
      ]);
    }

    // --- Movimientos recurrentes ---
    if (msg.includes('recurrente') || msg.includes('automatico')) {
      return this.pickVariant('recurrentes', [
        `Si tenés un gasto o ingreso que se repite (alquiler, sueldo, suscripciones), marcá "Repetir automáticamente" cuando lo cargues en **Movimientos** — así no tenés que tipearlo cada mes. ⚙️`
      ]);
    }

    // --- Exportar ---
    if (msg.includes('exportar') || msg.includes('csv') || msg.includes('descargar')) {
      return this.pickVariant('exportar', [
        `Podés bajarte todos tus movimientos en CSV con el botón de exportar. Sirve para llevarlo a Excel o compartirlo con tu contador. 📤`
      ]);
    }

    // --- Default ---
    return this.pickVariant('default', [
      `Uy, esa no la agarré del todo. Preguntame por ejemplo "¿cómo vengo este mes?", "¿en qué gasto más?" o "dame consejos para ahorrar" y te tiro posta. 💬`,
      `No estoy seguro de haber entendido bien. Puedo contarte de tu saldo del mes, tus presupuestos, tus metas de ahorro o darte tips generales de finanzas — probá con eso. 😉`
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
//    llame a cambiarTab('chat', this).
// 2. Una sección nueva <div class="tab" id="sec-chat"> con el scroll de
//    mensajes y el input, en el mismo estilo "glass" que ya usás.
// 3. Un par de funciones de UI (equivalentes a UI.sendChat() de Nutrio)
//    que llamen a FinanceChatApp.getBotResponse(mensaje) y pinten las
//    burbujas.
//
// No tengo tu index.html/CSS todavía (colores --emerald/--red, clase
// .glass, cómo está armado el "blob" del bottomNav), así que preferí
// dejarte el cerebro ya funcionando y pedirte esos archivos para
// terminar de pegar la parte visual sin romperte el diseño actual.
