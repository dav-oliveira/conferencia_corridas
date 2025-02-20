let parsedData = [];
let filteredData = [];
let currentFilter = 'finished';
let currentPage = 1;
const rowsPerPage = 15;

// 📌 Processa o arquivo CSV carregado pelo usuário
function processFile() {
    const fileInput = document.getElementById('fileInput').files[0];

    if (!fileInput) {
        alert('Por favor, selecione um arquivo.');
        return;
    }

    document.getElementById('loadingMessage').style.display = 'block';

    const reader = new FileReader();
    reader.onload = function (event) {
        Papa.parse(event.target.result, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                parsedData = results.data.map(parseRow).filter(row => row !== null);
                updatePaymentFilter();
                applyFilters();
                document.getElementById('loadingMessage').style.display = 'none';
            },
            error: function (error) {
                console.error('Erro ao processar o arquivo:', error);
                document.getElementById('loadingMessage').style.display = 'none';
                alert('Ocorreu um erro ao processar o arquivo. Tente novamente.');
            }
        });
    };
    reader.readAsText(fileInput, 'ISO-8859-1');
}

// 📌 Atualiza o filtro de forma de pagamento dinamicamente
function updatePaymentFilter() {
    const paymentSelect = document.getElementById('paymentFilter');
    paymentSelect.innerHTML = '<option value="">Todas as Formas de Pagamento</option>';

    const paymentMethods = [...new Set(parsedData.map(row => row.formaPagamento).filter(Boolean))];
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
    const differenceFilter = document.getElementById('differenceFilter').value;

    filteredData = parsedData.filter(row => row !== null); // 🔹 Agora não sobrescreve a variável global

    if (currentFilter === 'finished') {
        filteredData = filteredData.filter(row => row.diferenca !== null && row.diferenca !== 0);
        filteredData.sort((a, b) => b.diferenca - a.diferenca);
    } else if (currentFilter === 'canceled') {
        filteredData = filteredData.filter(row => row.status === 'Cancelada' && row.motorista !== 'N/A');
        filteredData.sort((a, b) => parseFloat(b.estimativa.replace('R$ ', '').replace(',', '.')) - parseFloat(a.estimativa.replace('R$ ', '').replace(',', '.')));
    }

    if (paymentFilter) {
        filteredData = filteredData.filter(row => row.formaPagamento === paymentFilter);
    }

    // 📌 Aplica o filtro de diferença (positivos, negativos ou todos)
    if (differenceFilter === 'negative') {
        filteredData = filteredData.filter(row => row.diferenca < 0);
    } else if (differenceFilter === 'positive') {
        filteredData = filteredData.filter(row => row.diferenca > 0);
    }

    // 📌 Se nenhum dado for encontrado, exibe uma mensagem
    if (filteredData.length === 0) {
        console.warn("Nenhum dado encontrado para os filtros aplicados.");
    }

    paginateData();
}

// 📌 Função de paginação
function paginateData() {
    const totalRows = filteredData.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage);

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    renderTable(paginatedData);
    renderPagination(totalPages);
}

// 📌 Renderiza os dados na tabela HTML
function renderTable(data) {
    const resultTableBody = document.getElementById('resultTable').querySelector('tbody');
    resultTableBody.innerHTML = '';

    if (data.length === 0) {
        resultTableBody.innerHTML = '<tr><td colspan="7">Nenhum dado encontrado</td></tr>';
        return;
    }

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

// 📌 Renderiza a navegação de páginas
function renderPagination(totalPages) {
    const paginationContainer = document.getElementById('pagination');
    paginationContainer.innerHTML = '';

    for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.classList.add('page-button');
        if (i === currentPage) {
            pageButton.classList.add('active'); // 🔹 Destaque na página atual
        }
        pageButton.addEventListener('click', () => goToPage(i));
        paginationContainer.appendChild(pageButton);
    }
}

// 📌 Vai para uma página específica
function goToPage(pageNumber) {
    if (pageNumber < 1 || pageNumber > Math.ceil(filteredData.length / rowsPerPage)) return;
    currentPage = pageNumber;
    paginateData();
}

// 📌 Atualiza o filtro de status e reaplica os filtros
function setFilter(filter) {
    currentFilter = filter;
    applyFilters();
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
        diferenca: diferenca !== null ? diferenca : 0, // 🔹 Agora sempre será um número válido
        diferencaStr
    };
}
