function processFile() {
    const fileInput = document.getElementById('fileInput').files[0];
    if (!fileInput) {
        alert('Por favor, selecione um arquivo.');
        return;
    }

    Papa.parse(fileInput, {
        header: true,
        encoding: "UTF-8",
        complete: function (results) {
            const data = results.data;
            const resultTableBody = document.getElementById('resultTable').querySelector('tbody');
            resultTableBody.innerHTML = '';

            data.forEach(row => {
                const estimativaStr = row['Estimativa do valor da corrida'];
                const valorCorridaStr = row['Valor da corrida'];

                if (!estimativaStr || !valorCorridaStr) {
                    console.error('Valores inválidos em:', row);
                    return;
                }

                const estimativaValor = parseFloat(estimativaStr.replace(',', '.'));
                const valorCorrida = parseFloat(valorCorridaStr.replace(',', '.'));

                if (isNaN(estimativaValor) || isNaN(valorCorrida)) {
                    console.error('Valores inválidos em:', row);
                    return;
                }

                if (valorCorrida < estimativaValor) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${row['Nº OS'] || 'N/A'}</td>
                        <td>${row['Status'] || 'N/A'}</td>
                        <td>${row['Motorista'] || 'N/A'}</td>
                        <td>R$ ${estimativaStr || 'N/A'}</td>
                        <td>R$ ${valorCorridaStr || 'N/A'}</td>

                    `;
                    resultTableBody.appendChild(tr);
                }
            });
        },
        error: function (error) {
            console.error('Erro ao processar o arquivo:', error);
        }
    });
}