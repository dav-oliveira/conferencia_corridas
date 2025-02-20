let parsedData = [];
let currentFilter = 'finished';

// 📌 Processa o arquivo CSV carregado pelo usuário
function processFile() {
    const fileInput = document.getElementById('fileInput').files[0];

    if (!fileInput) {
        alert('Por favor, selecione um arquivo.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        Papa.parse(event.target.result, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                parsedData = results.data;
                updatePaymentFilter(); // Atualiza a lista de formas de pagamento disponíveis
                applyFilters(); // Aplica os filtros ao carregar o arquivo
            },
            error: function (error) {
                console.error('Erro ao processar o arquivo:', error);
            }
        });
    };
    reader.readAsText(fileInput, 'ISO-8859-1');
}

// 📌 Atualiza o filtro de forma de pagamento dinamicamente
function updatePaymentFilter() {
    const paymentSelect = document.getElementById('paymentFilter');
    paymentSelect.innerHTML = '<option value="">Todas as Formas de Pagamento</option>';

    // Extrai as formas de pagamento únicas do CSV
    const paymentMethods = [...new Set(parsedData.map(row => row['Forma de pagamento']).filter(Boolean))];

    // Adiciona cada forma de pagamento ao select
    paymentMethods.forEach(method => {
        const option = document.createElement('option');
        option.value = method;
        option.textContent = method;
        paymentSelect.appendChild(option);
    });
}

// 📌 Aplica os filtros e exibe os resultados na tabela
function applyFilters() {
    const paymentFilter = document.getElementById('paymentFilter').value;

    let filteredData = parsedData.map(parseRow).filter(row => row !== null);

    if (currentFilter === 'finished') {
        filteredData = filteredData.filter(row => row.diferenca !== null && row.diferenca !== 0);
        // Ordena pelo maior valor de diferença
        filteredData.sort((a, b) => b.diferenca - a.diferenca);
    } else if (currentFilter === 'canceled') {
        filteredData = filteredData.filter(row => row.status === 'Cancelada' && row.motorista !== 'N/A');
        // Ordena pelo maior valor estimado da corrida
        filteredData.sort((a, b) => parseFloat(b.estimativa.replace('R$ ', '').replace(',', '.')) -
            parseFloat(a.estimativa.replace('R$ ', '').replace(',', '.')));
    }

    if (paymentFilter) {
        filteredData = filteredData.filter(row => row.formaPagamento === paymentFilter);
    }

    renderTable(filteredData);
}

// 📌 Converte uma linha do CSV para um objeto formatado
function parseRow(row) {
    const estimativaStr = row['Estimativa do valor da corrida'];
    const valorCorridaStr = row['Valor da corrida'];
    const status = row['Status'];
    const formaPagamento = row['Forma de pagamento'] || 'N/A';

    if (!estimativaStr || (!valorCorridaStr && status !== 'Cancelada')) return null;

    const estimativaValor = parseFloat(estimativaStr.replace(',', '.'));
    const valorCorrida = valorCorridaStr ? parseFloat(valorCorridaStr.replace(',', '.')) : null;

    if (isNaN(estimativaValor) || (valorCorrida !== null && isNaN(valorCorrida))) return null;

    let diferenca = null;
    let diferencaStr = 'N/A';

    if (valorCorrida !== null) {
        diferenca = valorCorrida - estimativaValor;
        const sinal = diferenca > 0 ? '+' : '';
        diferencaStr = `${sinal}R$ ${diferenca.toFixed(2).replace('.', ',')}`;
    }

    return {
        os: row['Nº OS'] || 'N/A',
        status: status || 'N/A',
        motorista: row['Motorista'] || 'N/A',
        formaPagamento,
        estimativa: `R$ ${estimativaStr || 'N/A'}`,
        valorFinal: valorCorridaStr ? `R$ ${valorCorridaStr}` : 'N/A',
        diferenca,
        diferencaStr
    };
}

// 📌 Renderiza os dados na tabela HTML
function renderTable(data) {
    const resultTableBody = document.getElementById('resultTable').querySelector('tbody');
    resultTableBody.innerHTML = '';

    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.os}</td>
            <td>${row.status}</td>
            <td>${row.motorista}</td>
            <td>${row.formaPagamento}</td>
            <td>${row.estimativa}</td>
            <td>${row.valorFinal}</td>
            <td>${row.diferencaStr}</td>
        `;
        resultTableBody.appendChild(tr);
    });
}

// 📌 Atualiza o filtro de status e reaplica os filtros
function setFilter(filter) {
    currentFilter = filter;
    applyFilters();
}