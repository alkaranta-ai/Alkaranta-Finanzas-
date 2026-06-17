function guardarMovimiento(){

    let tipo = document.getElementById("tipo").value;
    let categoria = document.getElementById("categoria").value;
    let monto = document.getElementById("monto").value;
    let descripcion = document.getElementById("descripcion").value;

    let lista = document.getElementById("movimientos");

    lista.innerHTML += `
        <div>
            ${tipo} - ${categoria} - $${monto}
            <br>
            ${descripcion}
            <hr>
        </div>
    `;
}
