let parsedData = [];
let filteredData = [];
let currentPage = 1;
const rowsPerPage = 15;
let currentFilter = '';

function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function parseCurrencyToNumber(str) {
    if (!str) return 0;
    return parseFloat(str.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
}

function processFile() {
    const fileInput = document.getElementById('fileInput').files[0];
    if (!fileInput) {
        alert('Por favor, selecione um arquivo.');
        return;
    }
    document.getElementById('loadingMessage').style.display = 'block';

    const reader = new FileReader();
    reader.onload = function(event) {
        Papa.parse(event.target.result, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                parsedData = results.data.map(parseRow).filter(row => row !== null);
                currentFilter = '';
                applyFilters();
                document.getElementById('loadingMessage').style.display = 'none';
            },
            error: function(error) {
                console.error('Erro ao processar o arquivo:', error);
                alert('Ocorreu um erro ao processar o arquivo. Tente novamente.');
                document.getElementById('loadingMessage').style.display = 'none';
            }
        });
    };
    reader.readAsText(fileInput, 'ISO-8859-1');
}

function applyFilters() {
    if (!parsedData.length) return;

    if (currentFilter === 'finishedPlus') {
        filteredData = parsedData.filter(row => {
            return row.status.toLowerCase() === 'finalizada' &&
                ['voucher', 'cartao no app', 'cartao app'].includes(normalizeText(row.formaPagamento)) &&
                row.porcentagem !== null &&
                row.porcentagem > 20 &&
                row.motorista.toUpperCase() !== 'N/A';
        });
    } else if (currentFilter === 'finished') {
        filteredData = parsedData.filter(row => {
            return row.status.toLowerCase() === 'finalizada' &&
                ['dinheiro', 'pix', 'cartao de credito', 'cartao de debito'].includes(normalizeText(row.formaPagamento)) &&
                row.porcentagem !== null &&
                row.porcentagem < -20 &&
                row.motorista.toUpperCase() !== 'N/A';
        });
    } else if (currentFilter === 'canceled') {
        filteredData = parsedData.filter(row => {
            const forma = normalizeText(row.formaPagamento);
            return row.status.toLowerCase() === 'cancelada' &&
                row.motorista.toUpperCase() !== 'N/A' &&
                (row.valorCorrida !== null && row.valorCorrida > 25 || forma === 'voucher');
        });

        filteredData.sort((a, b) => {
            const aIsVoucher = normalizeText(a.formaPagamento) === 'voucher' ? 0 : 1;
            const bIsVoucher = normalizeText(b.formaPagamento) === 'voucher' ? 0 : 1;
            if (aIsVoucher !== bIsVoucher) return aIsVoucher - bIsVoucher;
            const valA = parseCurrencyToNumber(a.estimativa);
            const valB = parseCurrencyToNumber(b.estimativa);
            return valB - valA;
        });

        currentPage = 1;
        paginateData();
        return;
    } else {
        // filtro padrão: finalizadas com diferença percentual > 20%
        filteredData = parsedData.filter(row => {
            return row.status.toLowerCase() === 'finalizada' &&
                row.porcentagem !== null &&
                Math.abs(row.porcentagem) > 20 &&
                row.motorista.toUpperCase() !== 'N/A';
        });
    }

    filteredData.sort((a, b) => {
        const valA = parseCurrencyToNumber(a.estimativa);
        const valB = parseCurrencyToNumber(b.estimativa);
        return valB - valA;
    });

    currentPage = 1;
    paginateData();
}

function paginateData() {
    const totalRows = filteredData.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage);

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    renderTable(paginatedData);
    renderPagination(totalPages);
}

function renderTable(data) {
    const tbody = document.querySelector('#resultTable tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">Nenhum dado encontrado</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        if (normalizeText(row.formaPagamento) === 'voucher') {
            tr.classList.add('voucher-row');
        }
        tr.innerHTML = `
            <td>${row.os}</td>
            <td>${row.status}</td>
            <td>${row.motorista}</td>
            <td>${row.formaPagamento}</td>
            <td>${row.estimativa}</td>
            <td>${row.valorFinal}</td>
            <td>${row.diferencaStr}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.classList.add('page-button');
        if (i === currentPage) btn.classList.add('active');
        btn.addEventListener('click', () => {
            currentPage = i;
            paginateData();
        });
        container.appendChild(btn);
    }
}

function parseRow(row) {
    const motorista = row['Motorista'];
    if (!motorista || motorista.trim().toUpperCase() === 'N/A') {
        return null;
    }

    const estimativaStr = row['Estimativa do valor da corrida'];
    const valorCorridaStr = row['Valor da corrida'];
    const status = row['Status'];
    const formaPagamento = row['Forma de pagamento'] || 'N/A';

    // Permitindo estimativa vazia só para canceladas
    if (!estimativaStr && status.toLowerCase() !== 'cancelada') return null;

    const estimativaValor = parseFloat((estimativaStr || '0').replace(',', '.'));
    const valorCorrida = valorCorridaStr ? parseFloat(valorCorridaStr.replace(',', '.')) : null;

    if (isNaN(estimativaValor) || (valorCorrida !== null && isNaN(valorCorrida))) return null;

    let diferenca = null;
    let diferencaStr = 'N/A';
    let valorFinal = 'N/A';

    if (status.toLowerCase() === 'cancelada') {
        valorFinal = valorCorridaStr ? `R$ ${valorCorridaStr}` : 'R$ 0,00';
        diferencaStr = 'R$ 0,00';
        diferenca = 0;
    } else if (valorCorrida !== null) {
        diferenca = valorCorrida - estimativaValor;
        const sinal = diferenca > 0 ? '+' : '';
        diferencaStr = `${sinal}R$ ${diferenca.toFixed(2).replace('.', ',')}`;
        valorFinal = `R$ ${valorCorridaStr}`;
    }

    return {
        os: row['Nº OS'] || 'N/A',
        status: status || 'N/A',
        motorista,
        formaPagamento,
        estimativa: estimativaStr ? `R$ ${estimativaStr}` : 'N/A',
        valorFinal,
        diferenca: diferenca !== null ? diferenca : 0,
        diferencaStr,
        porcentagem: (valorCorrida !== null && estimativaValor > 0)
            ? ((valorCorrida - estimativaValor) / estimativaValor) * 100
            : null,
        valorCorrida
    };
}
