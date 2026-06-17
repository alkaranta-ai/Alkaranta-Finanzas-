const categorias = {
    Ingreso: [
        "Sueldo",
        "Horas Extras",
        "Comisiones",
        "Ventas",
        "Honorarios",
        "Inversiones",
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
        "Otros"
    ]
};

let movimientos = JSON.parse(localStorage.getItem("movimientos")) || [];

function actualizarCategorias() {

    const tipo = document.getElementById("tipo").value;
    const categoria = document.getElementById("categoria");

    categoria.innerHTML = "";

    categorias[tipo].forEach(item => {

        let option = document.createElement("option");

        option.value = item;
        option.textContent = item;

        categoria.appendChild(option);

    });

}

function guardarMovimiento() {

    const fechaInput = document.getElementById("fecha").value;
    const tipo = document.getElementById("tipo").value;
    const categoria = document.getElementById("categoria").value;
    const monto = Number(document.getElementById("monto").value);
    const descripcion = document.getElementById("descripcion").value;

    if (!monto || monto <= 0) {
        alert("Ingrese un monto válido");
        return;
    }

    const movimiento = {
        fecha: fechaInput || new Date().toLocaleDateString("es-AR"),
        tipo,
        categoria,
        monto,
        descripcion
    };

    movimientos.push(movimiento);

    localStorage.setItem(
        "movimientos",
        JSON.stringify(movimientos)
    );

    document.getElementById("monto").value = "";
    document.getElementById("descripcion").value = "";

    renderizar();
}

function eliminarMovimiento(indice){

    if(!confirm("¿Eliminar movimiento?")){
        return;
    }

    movimientos.splice(indice,1);

    localStorage.setItem(
        "movimientos",
        JSON.stringify(movimientos)
    );

    renderizar();
}

function renderizar() {

    const tabla = document.getElementById("tablaMovimientos");

    tabla.innerHTML = "";

    let ingresos = 0;
    let egresos = 0;

    movimientos.forEach((mov, indice) => {

        if (mov.tipo === "Ingreso") {
            ingresos += mov.monto;
        } else {
            egresos += mov.monto;
        }

        tabla.innerHTML += `
            <tr>
                <td>${mov.fecha}</td>
                <td>${mov.tipo}</td>
                <td>${mov.categoria}</td>
                <td>$${mov.monto.toLocaleString()}</td>
                <td>
                    <button onclick="eliminarMovimiento(${indice})">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    });

    document.getElementById("totalIngresos").innerText =
        "$" + ingresos.toLocaleString();

    document.getElementById("totalEgresos").innerText =
        "$" + egresos.toLocaleString();

    document.getElementById("saldoTotal").innerText =
        "$" + (ingresos - egresos).toLocaleString();
}

actualizarCategorias();
renderizar();
