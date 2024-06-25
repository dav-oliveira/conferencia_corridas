let parsedData = [];
let currentFilter = 'finished';

function processFile() {
    const fileInput = document.getElementById('fileInput').files[0];
    if (!fileInput) {
        alert('Por favor, selecione um arquivo.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        const csvData = event.target.result;
        const utf8Data = new TextEncoder().encode(csvData);
        const blob = new Blob([utf8Data], { type: 'text/csv;charset=utf-8' });
        const utf8File = new File([blob], fileInput.name, { type: 'text/csv;charset=utf-8' });

        Papa.parse(utf8File, {
            header: true,
            complete: function (results) {
                parsedData = results.data;
                displayData(parsedData, currentFilter);
            },
            error: function (error) {
                console.error('Erro ao processar o arquivo:', error);
            }
        });
    };
    reader.readAsText(fileInput, 'ISO-8859-1');
}

function displayData(data, filter) {
    const resultTableBody = document.getElementById('resultTable').querySelector('tbody');
    resultTableBody.innerHTML = '';

    data.forEach(row => {
        const estimativaStr = row['Estimativa do valor da corrida'];
        const valorCorridaStr = row['Valor da corrida'];
        const status = row['Status'];

        if (!estimativaStr || (!valorCorridaStr && status !== 'Cancelada')) {
            console.error('Valores inválidos em:', row);
            return;
        }

        const estimativaValor = parseFloat(estimativaStr.replace(',', '.'));
        const valorCorrida = valorCorridaStr ? parseFloat(valorCorridaStr.replace(',', '.')) : null;

        if (isNaN(estimativaValor) || (valorCorrida !== null && isNaN(valorCorrida))) {
            console.error('Valores inválidos em:', row);
            return;
        }

        if ((filter === 'finished' && valorCorrida !== null && valorCorrida < estimativaValor && status !== 'Cancelada') ||
            (filter === 'canceled' && status === 'Cancelada' && row['Motorista'])) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row['Nº OS'] || 'N/A'}</td>
                <td>${status || 'N/A'}</td>
                <td>${row['Motorista'] || 'N/A'}</td>
                <td>R$ ${estimativaStr || 'N/A'}</td>
                <td>${valorCorridaStr ? `R$ ${valorCorridaStr}` : 'N/A'}</td>
            `;
            resultTableBody.appendChild(tr);
        }
    });
}

function filterFinished() {
    currentFilter = 'finished';
    displayData(parsedData, currentFilter);
}

function filterCanceled() {
    currentFilter = 'canceled';
    const canceledRides = parsedData.filter(row => row['Status'] === 'Cancelada' && row['Motorista']);
    canceledRides.sort((a, b) => {
        const aEstimativa = parseFloat(a['Estimativa do valor da corrida'].replace(',', '.'));
        const bEstimativa = parseFloat(b['Estimativa do valor da corrida'].replace(',', '.'));
        return bEstimativa - aEstimativa;
    });
    displayData(canceledRides, currentFilter);
}