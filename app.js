var categoriasDefault = {
  Ingreso: [
    "Sueldo",
    "Horas Extras",
    "Comisiones",
    "Ventas",
    "Honorarios",
    "Freelance",
    "Inversiones",
    "Alquiler Cobrado",
    "Reintegros",
    "Regalos",
    "Bono / Aguinaldo",
    "Préstamo Recibido",
    "Reembolso",
    "Herencia",
    "Premio / Sorteo",
    "Venta de Activos",
    "Dividendos",
    "Propinas",
    "Subsidio / Ayuda",
    "Otros"
  ],
  Egreso: [
    "Supermercado",
    "Combustible",
    "Servicios",
    "Internet",
    "Telefonía",
    "Salud",
    "Educación",
    "Impuestos",
    "Tarjetas",
    "Entretenimiento",
    "Alquiler/Expensas",
    "Indumentaria",
    "Mascotas",
    "Hogar/Mantenimiento",
    "Viajes",
    "Regalos",
    "Transporte",
    "Seguros",
    "Suscripciones",
    "Restaurantes/Delivery",
    "Cuidado Personal",
    "Deportes/Gimnasio",
    "Cultura/Libros",
    "Auto/Vehículo",
    "Ferretería/Bricolaje",
    "Donaciones",
    "Préstamos Otorgados",
    "Multas",
    "Farmacia",
    "Otros"
  ]
};

// "categorias" arranca con los valores por defecto y se sobreescribe con lo
// que cada usuario tenga guardado en Firestore (así cada cuenta puede
// personalizar, agregar o borrar sus propias categorías).
var categorias = JSON.parse(JSON.stringify(categoriasDefault));
var tabCategoriaActual = 'Ingreso';

// Los datos ahora viven en Firestore (colección "users", un documento por uid).
// Estas variables se completan cuando llega la primera respuesta del servidor,
// ver suscribirDatos() en la parte de abajo del archivo.
var movimientos  = [];
var presupuestos = {};
var metas        = [];
var recurrentes  = [];
var logrosDesbloqueados = [];

var modoActual   = 'personal';
var editandoIdx  = null;
var metaAhorroIdx = null;
var appIniciada  = false;
var guardando    = false;

// ---------------------------------------------------------------
// Sincronización con Firestore
// ---------------------------------------------------------------

function suscribirDatos(uid) {
  var ref = db.collection("users").doc(uid);
  unsubscribeSnapshot = ref.onSnapshot(function(snap) {
    var data = snap.exists ? snap.data() : {};
    movimientos = data.movimientos || [];
    presupuestos = data.presupuestos || {};
    metas = data.metas || [];
    recurrentes = data.recurrentes || [];
    logrosDesbloqueados = data.logros || [];

    if (data.categorias && data.categorias.Ingreso && data.categorias.Ingreso.length && data.categorias.Egreso && data.categorias.Egreso.length) {
      categorias = data.categorias;
    } else {
      categorias = JSON.parse(JSON.stringify(categoriasDefault));
    }

    if (!appIniciada) {
      appIniciada = true;
      inicializarUI();
    } else {
      // Actualización en vivo (por ejemplo, desde otro dispositivo): re-renderizamos.
      actualizarCategorias();
      poblarFiltroMeses();
      renderizar();
      renderPresupuesto();
      renderMetas();
      renderLogros();
    }
  }, function(err) {
    console.error("Error de sincronización:", err);
  });
}

function guardarDatos() {
  if (!currentUser) return Promise.resolve();
  guardando = true;
  return db.collection("users").doc(currentUser.uid).set({
    movimientos: movimientos,
    presupuestos: presupuestos,
    metas: metas,
    recurrentes: recurrentes,
    logros: logrosDesbloqueados,
    categorias: categorias
  }, { merge: true }).catch(function(err) {
    console.error("No se pudo guardar en la nube:", err);
    alert("No se pudo guardar. Revisá tu conexión a internet.");
  }).finally(function() { guardando = false; });
}

function inicializarUI() {
  document.getElementById("fecha").value = new Date().toISOString().split("T")[0];
  actualizarCategorias();
  poblarFiltroMeses();
  generarMovimientosRecurrentes();
  renderizar();
  renderPresupuesto();
  renderMetas();
  renderLogros();
  verificarRecordatorioDiario();
  setInterval(verificarRecordatorioDiario, 30 * 60 * 1000);
  document.addEventListener("visibilitychange", function() {
    if (!document.hidden) verificarRecordatorioDiario();
  });
  document.querySelectorAll(".overlay").forEach(function(m) {
    m.addEventListener("click", function(e) { if (e.target === m) cerrarModales(); });
  });
  moverIndicadorNav(document.querySelector(".nav-btn.active"), true);
  window.addEventListener("resize", function() {
    moverIndicadorNav(document.querySelector(".nav-btn.active"), true);
  });
}

// ---------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------

function cambiarTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('sec-' + tab).classList.add('active');
  btn.classList.add('active');
  moverIndicadorNav(btn);
  if (tab === 'inicio')        { renderizar(); }
  if (tab === 'movimientos')   { poblarFiltroMeses(); renderizar(); }
  if (tab === 'presupuesto')   { renderPresupuesto(); }
  if (tab === 'metas')         { renderMetas(); }
  if (tab === 'logros')        { renderLogros(); }
}

// Desliza el "blob" de vidrio líquido del dock inferior hasta quedar
// detrás del botón activo, imitando el indicador flotante de Apple.
function moverIndicadorNav(btn, sinTransicion) {
  var indicador = document.getElementById("navIndicator");
  var nav = document.getElementById("bottomNav");
  if (!indicador || !nav || !btn) return;
  var navRect = nav.getBoundingClientRect();
  var btnRect = btn.getBoundingClientRect();
  var left = btnRect.left - navRect.left;
  var width = btnRect.width;
  if (sinTransicion) {
    var prevTransition = indicador.style.transition;
    indicador.style.transition = "none";
    indicador.style.width = width + "px";
    indicador.style.transform = "translateX(" + left + "px)";
    // Forzar reflow antes de restaurar la transición.
    indicador.offsetHeight;
    indicador.style.transition = prevTransition || "";
  } else {
    indicador.style.width = width + "px";
    indicador.style.transform = "translateX(" + left + "px)";
  }
}

function cambiarModo(modo) {
  modoActual = modo;
  document.getElementById('btnPersonal').classList.toggle('active', modo === 'personal');
  document.getElementById('btnLaboral').classList.toggle('active', modo === 'laboral');
  cancelarEdicion();
  poblarFiltroMeses();
  renderizar();
  renderPresupuesto();
  renderMetas();
  renderLogros();
}

function pertenece(m) { return (m.entidad || 'personal') === modoActual; }

function actualizarCategorias() {
  var tipo = document.getElementById("tipo").value;
  var sel  = document.getElementById("categoria");
  var actual = sel.value;
  sel.innerHTML = "";
  (categorias[tipo] || []).forEach(function(c) {
    var o = document.createElement("option");
    o.value = o.textContent = c;
    sel.appendChild(o);
  });
  if (actual && (categorias[tipo] || []).indexOf(actual) !== -1) sel.value = actual;
}

// ---------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------

function toggleFrecuencia() {
  var chk = document.getElementById("esRecurrente");
  document.getElementById("campoFrecuencia").style.display = chk.checked ? "block" : "none";
}

function resetearRecurrente() {
  document.getElementById("esRecurrente").checked = false;
  toggleFrecuencia();
}

function guardarMovimiento() {
  var fecha       = document.getElementById("fecha").value;
  var tipo        = document.getElementById("tipo").value;
  var categoria   = document.getElementById("categoria").value;
  var monto       = Number(document.getElementById("monto").value);
  var descripcion = document.getElementById("descripcion").value.trim();
  var esRecurrente = document.getElementById("esRecurrente").checked;
  var frecuencia    = document.getElementById("frecuencia").value;
  if (!monto || monto <= 0) { alert("Ingresá un monto válido."); return; }
  if (!fecha) { alert("Seleccioná una fecha."); return; }
  if (!categoria) { alert("Seleccioná o creá una categoría."); return; }
  var mov = { fecha: fecha, tipo: tipo, categoria: categoria, monto: monto, descripcion: descripcion, entidad: modoActual };
  if (editandoIdx !== null) {
    // Si el movimiento editado ya pertenecía a un recurrente, conservamos el vínculo.
    if (movimientos[editandoIdx] && movimientos[editandoIdx].recurrenteId) {
      mov.recurrenteId = movimientos[editandoIdx].recurrenteId;
    }
    movimientos[editandoIdx] = mov;
    editandoIdx = null;
    document.getElementById("btnGuardar").textContent = "Guardar";
    document.getElementById("btnCancelar").style.display = "none";
  } else {
    if (esRecurrente) {
      var recId = "r" + Date.now();
      recurrentes.push({
        id: recId, tipo: tipo, categoria: categoria, monto: monto,
        descripcion: descripcion, frecuencia: frecuencia, fechaInicio: fecha,
        entidad: modoActual, activo: true
      });
      mov.recurrenteId = recId;
    }
    movimientos.push(mov);
  }
  guardarDatos(); limpiar(); resetearRecurrente(); poblarFiltroMeses(); renderizar(); renderPresupuesto();
  generarMovimientosRecurrentes();
  checkLogros();
}

function limpiar() {
  document.getElementById("monto").value = "";
  document.getElementById("descripcion").value = "";
}

function cancelarEdicion() {
  editandoIdx = null;
  document.getElementById("btnGuardar").textContent = "Guardar";
  document.getElementById("btnCancelar").style.display = "none";
  limpiar();
  resetearRecurrente();
}

function editarMovimiento(i) {
  var m = movimientos[i];
  if (!m) return;
  editandoIdx = i;
  document.getElementById("fecha").value       = m.fecha;
  document.getElementById("tipo").value        = m.tipo;
  actualizarCategorias();
  document.getElementById("categoria").value   = m.categoria;
  document.getElementById("monto").value       = m.monto;
  document.getElementById("descripcion").value = m.descripcion || "";
  document.getElementById("btnGuardar").textContent = "Actualizar";
  document.getElementById("btnCancelar").style.display = "block";
  document.getElementById("esRecurrente").checked = false;
  document.getElementById("esRecurrente").disabled = !!m.recurrenteId;
  toggleFrecuencia();
  cambiarTab('movimientos', document.querySelectorAll('.nav-btn')[1]);
  setTimeout(function() { document.querySelector('.form-card').scrollIntoView({ behavior: "smooth" }); }, 100);
}

function eliminarMovimiento(i) {
  if (!confirm("¿Eliminar este movimiento?")) return;
  if (editandoIdx !== null) {
    if (editandoIdx === i) cancelarEdicion();
    else if (editandoIdx > i) editandoIdx--;
  }
  movimientos.splice(i, 1);
  guardarDatos(); poblarFiltroMeses(); renderizar(); renderPresupuesto();
  checkLogros();
}

function poblarFiltroMeses() {
  var sel = document.getElementById("filtroMes");
  var actual = sel.value;
  var meses = {};
  movimientos.filter(pertenece).forEach(function(m) {
    if (m.fecha && m.fecha.length >= 7) meses[m.fecha.slice(0, 7)] = true;
  });
  sel.innerHTML = '<option value="">Todos los meses</option>';
  Object.keys(meses).sort().reverse().forEach(function(mes) {
    var parts = mes.split("-");
    var nombre = new Date(parts[0], parts[1] - 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    var o = document.createElement("option");
    o.value = mes;
    o.textContent = nombre.charAt(0).toUpperCase() + nombre.slice(1);
    if (mes === actual) o.selected = true;
    sel.appendChild(o);
  });
}

function ordenarMovimientos(lista) {
  var selOrden = document.getElementById("filtroOrden");
  var orden = selOrden ? selOrden.value : "fecha_desc";
  var copia = lista.slice();
  copia.sort(function(a, b) {
    if (orden === "monto_desc") return b.monto - a.monto;
    if (orden === "monto_asc")  return a.monto - b.monto;
    var fa = a.fecha || "", fb = b.fecha || "";
    if (orden === "fecha_asc") return fa < fb ? -1 : fa > fb ? 1 : 0;
    return fa < fb ? 1 : fa > fb ? -1 : 0; // fecha_desc (default)
  });
  return copia;
}

function renderizar() {
  var filtroMes  = document.getElementById("filtroMes").value;
  var filtroTipo = document.getElementById("filtroTipo").value;
  var filtrados = movimientos.filter(function(m) {
    return pertenece(m) &&
      (!filtroMes  || (m.fecha && m.fecha.startsWith(filtroMes))) &&
      (!filtroTipo || m.tipo === filtroTipo);
  });

  var ingresos = 0, egresos = 0;
  filtrados.forEach(function(m) { if (m.tipo === "Ingreso") ingresos += m.monto; else egresos += m.monto; });

  var saldo = ingresos - egresos;
  var sEl = document.getElementById("saldoTotal");
  sEl.textContent = "$" + saldo.toLocaleString("es-AR");
  sEl.className = "hero-amount" + (saldo < 0 ? " negative" : "");
  document.getElementById("totalIngresos").textContent = "$" + ingresos.toLocaleString("es-AR");
  document.getElementById("totalEgresos").textContent  = "$" + egresos.toLocaleString("es-AR");

  if (filtroMes) {
    var parts = filtroMes.split("-");
    document.getElementById("periodoLabel").textContent =
      new Date(parts[0], parts[1] - 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  } else {
    document.getElementById("periodoLabel").textContent = "Todos los períodos";
  }

  var lista = document.getElementById("listaMovimientos");
  lista.className = "list-group glass";
  lista.innerHTML = "";

  if (filtrados.length === 0) {
    lista.innerHTML = '<div class="empty"><span class="empty-icon">📭</span>Sin movimientos para mostrar.</div>';
  } else {
    ordenarMovimientos(filtrados).forEach(function(mov) {
      var idx = movimientos.indexOf(mov);
      var fecha = mov.fecha
        ? new Date(mov.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })
        : "";
      var isIng = mov.tipo === "Ingreso";
      var row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML =
        '<div class="list-row-left">' +
          '<div class="list-icon ' + (isIng ? 'ing' : 'egr') + '">' + (isIng ? '↑' : '↓') + '</div>' +
          '<div>' +
            '<div class="list-title">' + (mov.recurrenteId ? '🔁 ' : '') + mov.categoria + '</div>' +
            '<div class="list-sub">' + (mov.descripcion || mov.tipo) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="list-right">' +
          '<div class="list-amount ' + (isIng ? 'ing' : 'egr') + '">' + (isIng ? '+' : '-') + '$' + mov.monto.toLocaleString("es-AR") + '</div>' +
          '<div class="list-date">' + fecha + '</div>' +
        '</div>' +
        '<div class="list-actions">' +
          '<button class="btn-row-action" onclick="editarMovimiento(' + idx + ')">✏️</button>' +
          '<button class="btn-row-action" onclick="eliminarMovimiento(' + idx + ')">🗑️</button>' +
        '</div>';
      lista.appendChild(row);
    });
  }

  actualizarCategoriasList(filtrados);
  renderDashboard(ingresos, egresos, filtrados, filtroMes);
  renderInsights();
  actualizarBannerRecordatorio();
}

function actualizarCategoriasList(filtrados) {
  var cont = document.getElementById("listaCategorias");
  cont.className = "list-group glass";
  cont.innerHTML = "";
  var res = {};
  filtrados.forEach(function(m) { res[m.categoria] = (res[m.categoria] || 0) + m.monto; });
  var sorted = Object.entries(res).sort(function(a, b) { return b[1] - a[1]; });
  if (sorted.length === 0) {
    cont.innerHTML = '<div class="empty"><span class="empty-icon">📊</span>Sin datos aún.</div>';
    return;
  }
  var maxVal = sorted[0][1];
  sorted.forEach(function(entry) {
    var cat = entry[0], total = entry[1];
    var pct = Math.round((total / maxVal) * 100);
    var isEgreso = filtrados.some(function(m) { return m.categoria === cat && m.tipo === "Egreso"; });
    var color = isEgreso ? "var(--red)" : "var(--emerald)";
    var row = document.createElement("div");
    row.className = "list-row";
    row.style.flexDirection = "column";
    row.style.alignItems = "stretch";
    row.style.gap = "6px";
    row.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
        '<span style="color:var(--text-1);font-size:15px;font-weight:500">' + cat + '</span>' +
        '<span style="font-size:15px;font-weight:600;color:var(--text-1)">$' + total.toLocaleString("es-AR") + '</span>' +
      '</div>' +
      '<div class="prog-bar"><div class="prog-fill" style="width:' + pct + '%;background:' + color + '"></div></div>';
    cont.appendChild(row);
  });
}

function diasEnPeriodo(filtroMes, filtrados) {
  if (filtroMes) {
    var parts = filtroMes.split("-").map(Number);
    return new Date(parts[0], parts[1], 0).getDate();
  }
  var fechas = filtrados.map(function(m) { return m.fecha; }).filter(Boolean).sort();
  if (fechas.length === 0) return 1;
  var ini = new Date(fechas[0] + "T00:00:00");
  var fin = new Date(fechas[fechas.length - 1] + "T00:00:00");
  return Math.max(Math.round((fin - ini) / 86400000) + 1, 1);
}

function renderDashboard(ingresos, egresos, filtrados, filtroMes) {
  var total = ingresos + egresos;
  var pctIng = total > 0 ? Math.round((ingresos / total) * 100) : 50;
  var pctEgr = 100 - pctIng;
  document.getElementById("balBarIng").style.width = pctIng + "%";
  document.getElementById("balBarEgr").style.width = pctEgr + "%";
  document.getElementById("balPctIng").textContent = pctIng + "%";
  document.getElementById("balPctEgr").textContent = pctEgr + "%";
  var tasa = ingresos > 0 ? Math.round(((ingresos - egresos) / ingresos) * 100) : 0;
  var tasaEl = document.getElementById("kpiTasa");
  tasaEl.textContent = tasa + "%";
  tasaEl.classList.toggle("kpi-neg", tasa < 0);
  var porCat = {};
  filtrados.filter(function(m) { return m.tipo === "Egreso"; }).forEach(function(m) {
    porCat[m.categoria] = (porCat[m.categoria] || 0) + m.monto;
  });
  var topCat = Object.entries(porCat).sort(function(a, b) { return b[1] - a[1]; })[0];
  document.getElementById("kpiTopCat").textContent = topCat ? topCat[0] : "—";
  document.getElementById("kpiTopCatMonto").textContent = topCat ? "$" + topCat[1].toLocaleString("es-AR") : "$0";
  var dias = diasEnPeriodo(filtroMes, filtrados);
  var promedio = Math.round(egresos / dias);
  document.getElementById("kpiPromedio").textContent = "$" + promedio.toLocaleString("es-AR");
  document.getElementById("kpiMovs").textContent = filtrados.length;
}

function explicarTasaAhorro() {
  alert(
    "¿Cómo se calcula la tasa de ahorro?\n\n" +
    "Es automática: (Ingresos − Egresos) / Ingresos del período que estés viendo.\n\n" +
    "Para que sea correcta, registrá tus ingresos y egresos en 'Movimientos'.\n\n" +
    "Si querés guardar para un objetivo (vacaciones, auto, etc.), usá la pestaña 'Metas'."
  );
}

// ---------------------------------------------------------------
// Insights automáticos
// ---------------------------------------------------------------

function mesAnteriorISO(mesISO) {
  var p = mesISO.split("-").map(Number);
  var d = new Date(p[0], p[1] - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function generarInsights() {
  var insights = [];
  var hoy = new Date();
  var mesActual = hoy.toISOString().slice(0, 7);
  var mesAnt = mesAnteriorISO(mesActual);
  var delModo = movimientos.filter(pertenece);

  var delMesActual = delModo.filter(function(m) { return m.fecha && m.fecha.startsWith(mesActual); });
  var delMesAnt    = delModo.filter(function(m) { return m.fecha && m.fecha.startsWith(mesAnt); });

  var egrActual = delMesActual.filter(function(m) { return m.tipo === "Egreso"; }).reduce(function(s, m) { return s + m.monto; }, 0);
  var egrAnt    = delMesAnt.filter(function(m) { return m.tipo === "Egreso"; }).reduce(function(s, m) { return s + m.monto; }, 0);
  var ingActual = delMesActual.filter(function(m) { return m.tipo === "Ingreso"; }).reduce(function(s, m) { return s + m.monto; }, 0);
  var ingAnt    = delMesAnt.filter(function(m) { return m.tipo === "Ingreso"; }).reduce(function(s, m) { return s + m.monto; }, 0);

  // 1) Comparación de gasto total vs. mes anterior
  if (egrAnt > 0) {
    var variacion = Math.round(((egrActual - egrAnt) / egrAnt) * 100);
    if (variacion >= 15) {
      insights.push({ icon: "📈", tipo: "alerta", texto: "Gastaste " + variacion + "% más que el mes pasado ($" + egrActual.toLocaleString("es-AR") + " vs. $" + egrAnt.toLocaleString("es-AR") + ")." });
    } else if (variacion <= -15) {
      insights.push({ icon: "📉", tipo: "positivo", texto: "Gastaste " + Math.abs(variacion) + "% menos que el mes pasado. ¡Buen trabajo!" });
    }
  }

  // 2) Categoría con mayor incremento respecto al mes anterior
  var porCatActual = {}, porCatAnt = {};
  delMesActual.filter(function(m) { return m.tipo === "Egreso"; }).forEach(function(m) { porCatActual[m.categoria] = (porCatActual[m.categoria] || 0) + m.monto; });
  delMesAnt.filter(function(m) { return m.tipo === "Egreso"; }).forEach(function(m) { porCatAnt[m.categoria] = (porCatAnt[m.categoria] || 0) + m.monto; });
  var mayorIncrementoCat = null, mayorIncrementoVal = 0;
  Object.keys(porCatActual).forEach(function(cat) {
    var dif = porCatActual[cat] - (porCatAnt[cat] || 0);
    if (dif > mayorIncrementoVal) { mayorIncrementoVal = dif; mayorIncrementoCat = cat; }
  });
  if (mayorIncrementoCat && (porCatAnt[mayorIncrementoCat] || 0) > 0) {
    insights.push({ icon: "🔍", tipo: "info", texto: '"' + mayorIncrementoCat + '" es la categoría que más creció este mes: +$' + mayorIncrementoVal.toLocaleString("es-AR") + " respecto al mes anterior." });
  }

  // 3) Proyección de gasto de fin de mes
  var diaHoy = hoy.getDate();
  var diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  if (diaHoy >= 5 && egrActual > 0 && diaHoy < diasDelMes) {
    var proyeccion = Math.round((egrActual / diaHoy) * diasDelMes);
    insights.push({ icon: "🔮", tipo: "info", texto: "A este ritmo, vas a terminar el mes con aproximadamente $" + proyeccion.toLocaleString("es-AR") + " en egresos." });
  }

  // 4) Presupuestos en riesgo
  var keysPres = Object.keys(presupuestos).filter(function(k) { return k.startsWith(modoActual + "_"); });
  keysPres.forEach(function(key) {
    var cat = key.replace(modoActual + "_", "");
    var limite = presupuestos[key];
    var gastado = delMesActual.filter(function(m) { return m.tipo === "Egreso" && m.categoria === cat; }).reduce(function(s, m) { return s + m.monto; }, 0);
    var pct = limite > 0 ? gastado / limite : 0;
    if (pct >= 0.85 && diaHoy < diasDelMes) {
      insights.push({ icon: "⚠️", tipo: "alerta", texto: 'Ya usaste el ' + Math.round(pct * 100) + '% del presupuesto de "' + cat + '" y todavía quedan ' + (diasDelMes - diaHoy) + ' días del mes.' });
    }
  });

  // 5) Mejora en tasa de ahorro
  if (ingActual > 0 && ingAnt > 0) {
    var tasaActual = ((ingActual - egrActual) / ingActual) * 100;
    var tasaAnt = ((ingAnt - egrAnt) / ingAnt) * 100;
    if (tasaActual > tasaAnt + 5) {
      insights.push({ icon: "💪", tipo: "positivo", texto: "Tu tasa de ahorro subió de " + Math.round(tasaAnt) + "% a " + Math.round(tasaActual) + "% respecto al mes pasado." });
    }
  }

  return insights.slice(0, 4);
}

function renderInsights() {
  var cont = document.getElementById("insightsList");
  if (!cont) return;
  var insights = generarInsights();
  cont.innerHTML = "";
  if (insights.length === 0) {
    cont.innerHTML = '<div class="empty"><span class="empty-icon">✨</span>Todavía no hay suficientes datos para generar insights.</div>';
    return;
  }
  insights.forEach(function(ins) {
    var div = document.createElement("div");
    div.className = "insight-card glass " + ins.tipo;
    div.innerHTML = '<span class="insight-icon">' + ins.icon + '</span><span class="insight-text">' + ins.texto + '</span>';
    cont.appendChild(div);
  });
}

// ---------------------------------------------------------------
// Recordatorio de carga diaria
// ---------------------------------------------------------------

var REMINDER_HOUR = 20; // hora local a partir de la cual se sugiere el recordatorio

function hoyISO() { return new Date().toISOString().split("T")[0]; }

function tieneMovimientoHoy() {
  var hoy = hoyISO();
  return movimientos.some(function(m) { return m.fecha === hoy; });
}

function actualizarBannerRecordatorio() {
  var banner = document.getElementById("reminderBanner");
  if (!banner) return;
  if (tieneMovimientoHoy()) { banner.style.display = "none"; return; }
  var dismissKey = "alkaranta_reminder_dismiss_" + hoyISO();
  if (localStorage.getItem(dismissKey)) { banner.style.display = "none"; return; }
  var sub = document.getElementById("reminderSub");
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    sub.textContent = "Activá recordatorios para que te avisemos cada día.";
  } else {
    sub.textContent = "Todavía no cargaste ningún movimiento hoy.";
  }
  banner.style.display = "flex";
}

function accionRecordatorio() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().then(function() { actualizarBannerRecordatorio(); });
  }
  cambiarTab("movimientos", document.querySelectorAll(".nav-btn")[1]);
}

function cerrarBannerRecordatorio() {
  localStorage.setItem("alkaranta_reminder_dismiss_" + hoyISO(), "1");
  document.getElementById("reminderBanner").style.display = "none";
}

function verificarRecordatorioDiario() {
  actualizarBannerRecordatorio();
  var ahora = new Date();
  if (ahora.getHours() < REMINDER_HOUR) return;
  if (tieneMovimientoHoy()) return;
  var lastNotifKey = "alkaranta_last_notif";
  if (localStorage.getItem(lastNotifKey) === hoyISO()) return;
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("Alkaranta Finanzas", {
        body: "No registraste movimientos hoy. ¡No te olvides de cargarlos!",
        icon: "icono-192.png",
        tag: "recordatorio-diario"
      });
      localStorage.setItem(lastNotifKey, hoyISO());
    } catch (e) { /* Notification no soportado o bloqueado: no hacemos nada */ }
  }
}

// ---------------------------------------------------------------
// Movimientos recurrentes
// ---------------------------------------------------------------

function sumarFrecuencia(fechaISO, frecuencia, n) {
  var d = new Date(fechaISO + "T00:00:00");
  if (frecuencia === "semanal") d.setDate(d.getDate() + 7 * n);
  else if (frecuencia === "quincenal") d.setDate(d.getDate() + 15 * n);
  else d.setMonth(d.getMonth() + n); // mensual (default)
  return d.toISOString().split("T")[0];
}

function generarMovimientosRecurrentes() {
  var hoy = hoyISO();
  var huboCambios = false;
  recurrentes.forEach(function(r) {
    if (!r.activo) return;
    var n = 1;
    while (true) {
      var fechaCandidata = sumarFrecuencia(r.fechaInicio, r.frecuencia, n);
      if (fechaCandidata > hoy) break;
      var yaExiste = movimientos.some(function(m) { return m.recurrenteId === r.id && m.fecha === fechaCandidata; });
      if (!yaExiste) {
        movimientos.push({
          fecha: fechaCandidata, tipo: r.tipo, categoria: r.categoria, monto: r.monto,
          descripcion: r.descripcion, entidad: r.entidad, recurrenteId: r.id
        });
        huboCambios = true;
      }
      n++;
      if (n > 500) break; // salvaguarda ante datos corruptos
    }
  });
  if (huboCambios) {
    guardarDatos(); poblarFiltroMeses(); renderizar(); renderPresupuesto(); checkLogros();
  }
}

function abrirModalRecurrentes() {
  renderListaRecurrentes();
  document.getElementById("modalRecurrentes").classList.add("open");
}

function renderListaRecurrentes() {
  var cont = document.getElementById("listaRecurrentes");
  cont.innerHTML = "";
  var delModo = recurrentes.filter(function(r) { return (r.entidad || "personal") === modoActual; });
  if (delModo.length === 0) {
    cont.innerHTML = '<div class="empty" style="padding:24px"><span class="empty-icon">🔁</span>No tenés movimientos recurrentes. Marcá "Repetir automáticamente" al cargar uno nuevo.</div>';
    return;
  }
  delModo.forEach(function(r) {
    var idx = recurrentes.indexOf(r);
    var freqLabel = r.frecuencia === "semanal" ? "Semanal" : r.frecuencia === "quincenal" ? "Quincenal" : "Mensual";
    var isIng = r.tipo === "Ingreso";
    var row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML =
      '<div class="list-row-left">' +
        '<div class="list-icon ' + (isIng ? 'ing' : 'egr') + '">' + (isIng ? '↑' : '↓') + '</div>' +
        '<div>' +
          '<div class="list-title">' + r.categoria + '</div>' +
          '<div class="list-sub">' + freqLabel + ' · $' + r.monto.toLocaleString("es-AR") + (r.activo ? '' : ' · pausado') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="list-actions">' +
        '<button class="btn-row-action" onclick="toggleRecurrente(' + idx + ')">' + (r.activo ? '⏸️' : '▶️') + '</button>' +
        '<button class="btn-row-action" onclick="eliminarRecurrente(' + idx + ')">🗑️</button>' +
      '</div>';
    cont.appendChild(row);
  });
}

function toggleRecurrente(idx) {
  recurrentes[idx].activo = !recurrentes[idx].activo;
  guardarDatos();
  renderListaRecurrentes();
  if (recurrentes[idx].activo) generarMovimientosRecurrentes();
}

function eliminarRecurrente(idx) {
  if (!confirm("¿Eliminar este movimiento recurrente? Los movimientos ya generados no se borran.")) return;
  recurrentes.splice(idx, 1);
  guardarDatos();
  renderListaRecurrentes();
}

// ---------------------------------------------------------------
// Categorías personalizadas
// ---------------------------------------------------------------

function abrirModalCategorias() {
  tabCategoriaActual = document.getElementById('tipo').value || 'Ingreso';
  document.getElementById('catTabIngreso').classList.toggle('active', tabCategoriaActual === 'Ingreso');
  document.getElementById('catTabEgreso').classList.toggle('active', tabCategoriaActual === 'Egreso');
  document.getElementById('nuevaCategoriaInput').value = '';
  renderListaCategoriasEdit();
  document.getElementById('modalCategorias').classList.add('open');
}

function cambiarTabCategoria(tipo) {
  tabCategoriaActual = tipo;
  document.getElementById('catTabIngreso').classList.toggle('active', tipo === 'Ingreso');
  document.getElementById('catTabEgreso').classList.toggle('active', tipo === 'Egreso');
  renderListaCategoriasEdit();
}

function renderListaCategoriasEdit() {
  var cont = document.getElementById('listaCategoriasEdit');
  cont.innerHTML = '';
  var lista = categorias[tabCategoriaActual] || [];
  if (lista.length === 0) {
    cont.innerHTML = '<div class="empty" style="padding:24px"><span class="empty-icon">🏷️</span>No hay categorías. Agregá la primera.</div>';
    return;
  }
  lista.forEach(function(cat) {
    var row = document.createElement('div');
    row.className = 'list-row';
    var safe = cat.replace(/'/g, "\\'");
    row.innerHTML =
      '<span style="font-size:15px;color:var(--text-1)">' + cat + '</span>' +
      '<button class="btn-row-action" onclick="eliminarCategoria(\'' + safe + '\')" title="Eliminar">🗑️</button>';
    cont.appendChild(row);
  });
}

function agregarCategoria() {
  var input = document.getElementById('nuevaCategoriaInput');
  var nombre = input.value.trim();
  if (!nombre) { alert('Escribí un nombre para la categoría.'); return; }
  if (nombre.length > 30) { alert('Usá un nombre más corto (máx. 30 caracteres).'); return; }
  var lista = categorias[tabCategoriaActual];
  if (lista.some(function(c) { return c.toLowerCase() === nombre.toLowerCase(); })) {
    alert('Esa categoría ya existe.');
    return;
  }
  var idxOtros = lista.indexOf('Otros');
  if (idxOtros !== -1) lista.splice(idxOtros, 0, nombre);
  else lista.push(nombre);
  input.value = '';
  guardarDatos();
  renderListaCategoriasEdit();
  actualizarCategorias();
}

function eliminarCategoria(cat) {
  var lista = categorias[tabCategoriaActual];
  if (lista.length <= 1) { alert('Debe quedar al menos una categoría.'); return; }
  var enUso = movimientos.some(function(m) { return m.tipo === tabCategoriaActual && m.categoria === cat; });
  var msg = enUso
    ? 'La categoría "' + cat + '" tiene movimientos registrados. Si la eliminás, esos movimientos quedan igual pero ya no vas a poder elegirla para nuevos. ¿Eliminar de todas formas?'
    : '¿Eliminar la categoría "' + cat + '"?';
  if (!confirm(msg)) return;
  categorias[tabCategoriaActual] = lista.filter(function(c) { return c !== cat; });
  guardarDatos();
  renderListaCategoriasEdit();
  actualizarCategorias();
}

// ---------------------------------------------------------------
// Presupuesto
// ---------------------------------------------------------------

function abrirModalPresupuesto() {
  var sel = document.getElementById("budgetCat");
  sel.innerHTML = "";
  var usadas = {};
  Object.keys(presupuestos).filter(function(k) { return k.startsWith(modoActual + "_"); }).forEach(function(k) {
    usadas[k.replace(modoActual + "_", "")] = true;
  });
  categorias.Egreso.forEach(function(c) {
    if (usadas[c]) return;
    var o = document.createElement("option");
    o.value = o.textContent = c;
    sel.appendChild(o);
  });
  if (sel.options.length === 0) {
    alert("Ya tenés presupuestos en todas las categorías. Eliminá uno antes de agregar otro.");
    return;
  }
  document.getElementById("budgetMonto").value = "";
  document.getElementById("modalPresupuesto").classList.add("open");
}

function guardarPresupuesto() {
  var cat   = document.getElementById("budgetCat").value;
  var monto = Number(document.getElementById("budgetMonto").value);
  if (!monto || monto <= 0) { alert("Ingresá un monto válido."); return; }
  presupuestos[modoActual + "_" + cat] = monto;
  guardarDatos(); cerrarModales(); renderPresupuesto();
  checkLogros();
}

function eliminarPresupuesto(key) {
  var cat = key.replace(modoActual + "_", "");
  if (!confirm("¿Eliminar el presupuesto de \"" + cat + "\"?")) return;
  delete presupuestos[key];
  guardarDatos(); renderPresupuesto();
  checkLogros();
}

function renderPresupuesto() {
  var filtroMes = document.getElementById("filtroMes") ? document.getElementById("filtroMes").value : "";
  var mes = filtroMes || new Date().toISOString().slice(0, 7);
  var cont = document.getElementById("budgetList");
  cont.className = "list-group glass";
  cont.innerHTML = "";
  var keys = Object.keys(presupuestos).filter(function(k) { return k.startsWith(modoActual + "_"); });
  if (keys.length === 0) {
    cont.innerHTML = '<div class="empty"><span class="empty-icon">🎯</span>No hay presupuestos aún.</div>';
    return;
  }
  var totalLimite = 0, totalGastado = 0;
  keys.forEach(function(key) {
    var cat     = key.replace(modoActual + "_", "");
    var limite  = presupuestos[key];
    var gastado = movimientos
      .filter(function(m) { return pertenece(m) && m.tipo === "Egreso" && m.categoria === cat && m.fecha && m.fecha.startsWith(mes); })
      .reduce(function(s, m) { return s + m.monto; }, 0);
    var pct = Math.min((gastado / limite) * 100, 100);
    var cls = pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok";
    totalLimite  += limite;
    totalGastado += gastado;
    var div = document.createElement("div");
    div.className = "budget-row";
    div.innerHTML =
      '<div class="budget-head">' +
        '<span class="budget-name">' + cat + '</span>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span class="budget-nums">$' + gastado.toLocaleString("es-AR") + ' / <b>$' + limite.toLocaleString("es-AR") + '</b></span>' +
          '<button class="btn-row-action" onclick="eliminarPresupuesto(\'' + key + '\')" title="Eliminar" style="padding:3px 7px;font-size:11px">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="prog-bar"><div class="prog-fill ' + cls + '" style="width:' + pct + '%"></div></div>';
    cont.appendChild(div);
  });
  if (keys.length > 1) {
    var totalPct = Math.min((totalGastado / totalLimite) * 100, 100);
    var totalCls = totalPct >= 100 ? "over" : totalPct >= 80 ? "warn" : "ok";
    var totalDiv = document.createElement("div");
    totalDiv.className = "budget-row";
    totalDiv.style.background = "var(--surface-2)";
    totalDiv.style.fontWeight = "600";
    totalDiv.innerHTML =
      '<div class="budget-head">' +
        '<span class="budget-name">Total</span>' +
        '<span class="budget-nums">$' + totalGastado.toLocaleString("es-AR") + ' / <b>$' + totalLimite.toLocaleString("es-AR") + '</b></span>' +
      '</div>' +
      '<div class="prog-bar"><div class="prog-fill ' + totalCls + '" style="width:' + totalPct + '%"></div></div>';
    cont.appendChild(totalDiv);
  }
}

// ---------------------------------------------------------------
// Metas
// ---------------------------------------------------------------

function abrirModalMeta() {
  ["metaNombre", "metaObjetivo", "metaAhorrado"].forEach(function(id) { document.getElementById(id).value = ""; });
  document.getElementById("modalMeta").classList.add("open");
}

function guardarMeta() {
  var nombre   = document.getElementById("metaNombre").value.trim();
  var objetivo = Number(document.getElementById("metaObjetivo").value);
  var ahorrado = Number(document.getElementById("metaAhorrado").value) || 0;
  var icono    = document.getElementById("metaIcono").value;
  if (!nombre) { alert("Ingresá un nombre."); return; }
  if (!objetivo || objetivo <= 0) { alert("Ingresá un objetivo válido."); return; }
  metas.push({ nombre: nombre, objetivo: objetivo, ahorrado: ahorrado, icono: icono, entidad: modoActual });
  guardarDatos(); cerrarModales(); renderMetas();
  checkLogros();
}

function abrirModalAhorro(idx) {
  metaAhorroIdx = idx;
  document.getElementById("modalAhorroTitulo").textContent = metas[idx].nombre;
  document.getElementById("ahorroMonto").value = "";
  document.getElementById("modalAhorro").classList.add("open");
}

function confirmarAhorro() {
  var monto = Number(document.getElementById("ahorroMonto").value);
  if (!monto || monto <= 0) { alert("Ingresá un monto válido."); return; }
  metas[metaAhorroIdx].ahorrado += monto;
  guardarDatos(); cerrarModales(); renderMetas();
  checkLogros();
}

function eliminarMeta(idx) {
  if (!confirm("¿Eliminar esta meta?")) return;
  metas.splice(idx, 1);
  guardarDatos(); renderMetas();
  checkLogros();
}

function renderMetas() {
  var grid = document.getElementById("metaGrid");
  grid.innerHTML = "";
  var del = [];
  metas.forEach(function(m, i) {
    if ((m.entidad || 'personal') === modoActual) del.push({ nombre: m.nombre, objetivo: m.objetivo, ahorrado: m.ahorrado, icono: m.icono, _i: i });
  });
  if (del.length === 0) {
    var empty = document.createElement("div");
    empty.style.gridColumn = "1/-1";
    empty.className = "empty";
    empty.innerHTML = '<span class="empty-icon">⭐</span>Todavía no tenés metas. Creá la primera.';
    grid.appendChild(empty);
  }
  del.forEach(function(m) {
    var pct = Math.min(Math.round((m.ahorrado / m.objetivo) * 100), 100);
    var cls = pct >= 100 ? "over" : pct >= 60 ? "warn" : "ok";
    var card = document.createElement("div");
    card.className = "meta-card glass";
    card.innerHTML =
      '<span class="meta-emoji">' + m.icono + '</span>' +
      '<div class="meta-name">' + m.nombre + '</div>' +
      '<div class="meta-sub">$<b>' + m.ahorrado.toLocaleString("es-AR") + '</b> de $' + m.objetivo.toLocaleString("es-AR") + '</div>' +
      '<div class="prog-bar"><div class="prog-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
      '<div class="meta-pct">' + pct + '%</div>' +
      '<div class="meta-btns">' +
        '<button class="btn-meta-plus" onclick="abrirModalAhorro(' + m._i + ')">+ Agregar</button>' +
        '<button class="btn-meta-del" onclick="eliminarMeta(' + m._i + ')">🗑️</button>' +
      '</div>';
    grid.appendChild(card);
  });
  var btnNew = document.createElement("button");
  btnNew.className = "btn-add-meta";
  btnNew.textContent = "+ Nueva meta";
  btnNew.onclick = abrirModalMeta;
  grid.appendChild(btnNew);
}

function cerrarModales() {
  document.querySelectorAll(".overlay").forEach(function(m) {
    m.classList.remove("open");
    m.style.top = '';
    m.style.height = '';
  });
}

function exportarCSV() {
  var del = movimientos.filter(pertenece);
  if (del.length === 0) { alert("No hay movimientos para exportar."); return; }
  var enc  = ["Fecha", "Tipo", "Categoría", "Monto", "Descripción"];
  var filas = del.map(function(m) { return [m.fecha, m.tipo, m.categoria, m.monto, m.descripcion || ""]; });
  var csv = [enc].concat(filas).map(function(r) {
    return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
  }).join("\n");
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
  a.download = "finanzas-" + modoActual + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
  checkLogros();
}

function resetearFecha() {
  document.getElementById("fecha").value = new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------
// Logros
// ---------------------------------------------------------------

var LOGROS_DEF = [
  { id: 'primer_mov',    emoji: '🎬', nombre: 'Primer paso',       desc: 'Registra tu primer movimiento' },
  { id: 'primer_ing',    emoji: '💰', nombre: 'Primer ingreso',    desc: 'Registra tu primer ingreso' },
  { id: 'primer_egr',    emoji: '🛒', nombre: 'Primer gasto',      desc: 'Registra tu primer egreso' },
  { id: 'mov_10',        emoji: '📊', nombre: 'Diez movimientos',  desc: 'Alcanzá 10 movimientos' },
  { id: 'mov_50',        emoji: '🚀', nombre: 'Cincuenta',         desc: 'Alcanzá 50 movimientos' },
  { id: 'mov_100',       emoji: '💎', nombre: 'Cien movimientos',  desc: 'Alcanzá 100 movimientos' },
  { id: 'primer_pres',   emoji: '🎯', nombre: 'Presupuestador',    desc: 'Creá tu primer presupuesto' },
  { id: 'pres_3',        emoji: '🧠', nombre: 'Organizado',        desc: 'Creá presupuestos en 3 categorías' },
  { id: 'primer_meta',   emoji: '⭐', nombre: 'Soñador',           desc: 'Creá tu primera meta de ahorro' },
  { id: 'meta_cumplida', emoji: '🏆', nombre: 'Meta cumplida',     desc: 'Completá una meta al 100%' },
  { id: 'ahorro_30',     emoji: '📈', nombre: 'Ahorrador',         desc: 'Tasa de ahorro mayor al 30% en algún mes' },
  { id: 'ahorro_50',     emoji: '💎', nombre: 'Súper ahorrador',   desc: 'Tasa de ahorro mayor al 50% en algún mes' },
  { id: 'meses_3',       emoji: '📅', nombre: 'Constancia',        desc: 'Registra movimientos en 3 meses distintos' },
  { id: 'cats_5',        emoji: '🏷️', nombre: 'Explorador',        desc: 'Usá 5 categorías de gasto distintas' },
  { id: 'exportar',      emoji: '📤', nombre: 'Exportador',        desc: 'Exportá tus datos a CSV' }
];

function checkLogros() {
  var delModo = movimientos.filter(pertenece);
  var ahora = [];

  if (delModo.length >= 1) ahora.push('primer_mov');
  if (delModo.some(function(m) { return m.tipo === 'Ingreso'; })) ahora.push('primer_ing');
  if (delModo.some(function(m) { return m.tipo === 'Egreso'; })) ahora.push('primer_egr');
  if (delModo.length >= 10) ahora.push('mov_10');
  if (delModo.length >= 50) ahora.push('mov_50');
  if (delModo.length >= 100) ahora.push('mov_100');

  var totalPres = Object.keys(presupuestos).filter(function(k) { return k.startsWith(modoActual + "_"); }).length;
  if (totalPres >= 1) ahora.push('primer_pres');
  if (totalPres >= 3) ahora.push('pres_3');

  var delMetas = metas.filter(function(m) { return (m.entidad || 'personal') === modoActual; });
  if (delMetas.length >= 1) ahora.push('primer_meta');
  if (delMetas.some(function(m) { return m.ahorrado >= m.objetivo; })) ahora.push('meta_cumplida');

  var mesesSet = {};
  delModo.forEach(function(m) { if (m.fecha && m.fecha.length >= 7) mesesSet[m.fecha.slice(0, 7)] = true; });
  Object.keys(mesesSet).forEach(function(mes) {
    var delMes = delModo.filter(function(m) { return m.fecha && m.fecha.startsWith(mes); });
    var ing = delMes.filter(function(m) { return m.tipo === 'Ingreso'; }).reduce(function(s, m) { return s + m.monto; }, 0);
    var egr = delMes.filter(function(m) { return m.tipo === 'Egreso'; }).reduce(function(s, m) { return s + m.monto; }, 0);
    if (ing > 0) {
      var tasa = ((ing - egr) / ing) * 100;
      if (tasa >= 30) ahora.push('ahorro_30');
      if (tasa >= 50) ahora.push('ahorro_50');
    }
  });

  if (Object.keys(mesesSet).length >= 3) ahora.push('meses_3');

  var catsEgr = {};
  delModo.filter(function(m) { return m.tipo === 'Egreso'; }).forEach(function(m) { catsEgr[m.categoria] = true; });
  if (Object.keys(catsEgr).length >= 5) ahora.push('cats_5');

  var cambio = JSON.stringify(logrosDesbloqueados) !== JSON.stringify(ahora);
  logrosDesbloqueados = ahora;
  if (cambio) { guardarDatos(); renderLogros(); }
  return cambio;
}

function renderLogros() {
  var grid = document.getElementById("logrosGrid");
  grid.innerHTML = "";
  var total = LOGROS_DEF.length;
  var completados = 0;

  LOGROS_DEF.forEach(function(logro) {
    var unlocked = logrosDesbloqueados.indexOf(logro.id) !== -1;
    if (unlocked) completados++;
    var card = document.createElement("div");
    card.className = "logro-card glass" + (unlocked ? "" : " locked");
    card.innerHTML =
      '<span class="logro-emoji">' + logro.emoji + '</span>' +
      '<div class="logro-name">' + logro.nombre + '</div>' +
      '<div class="logro-desc">' + logro.desc + '</div>' +
      (unlocked ? '<div class="logro-check">✓</div>' : '');
    grid.appendChild(card);
  });

  document.getElementById("logrosCount").textContent = completados + " / " + total;
  document.getElementById("logrosBar").style.width = (total > 0 ? Math.round((completados / total) * 100) : 0) + "%";
}
