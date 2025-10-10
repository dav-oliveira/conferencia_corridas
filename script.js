// =====================
// 🔹 VARIÁVEIS GLOBAIS 🔹
// =====================
let parsedData = [];
let filteredData = [];
let currentPage = 1;
const rowsPerPage = 15;
let currentFilter = '';

// =====================
// 🔹 FUNÇÕES UTILITÁRIAS 🔹
// =====================
function normalizeText(text) {
    if (!text) return '';
    return String(text).toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function parseCurrencyToNumber(str) {
    if (!str) return 0;
    const cleanStr = String(str).replace(/[^\d,.]/g, '').replace(',', '.');
    return parseFloat(cleanStr) || 0;
}

// =====================
// 🔹 FILTROS E ORDENAÇÃO 🔹
// =====================
const sortByEstimativaDesc = (a, b) => parseCurrencyToNumber(b.estimativa) - parseCurrencyToNumber(a.estimativa);
const sortByFinalValueDesc = (a, b) => parseCurrencyToNumber(b.valorFinal) - parseCurrencyToNumber(a.valorFinal);

const sortCanceled = (a, b) => {
    const aIsVoucher = normalizeText(a.formaPagamento) === 'voucher' ? 0 : 1;
    const bIsVoucher = normalizeText(b.formaPagamento) === 'voucher' ? 0 : 1;
    if (aIsVoucher !== bIsVoucher) return aIsVoucher - bIsVoucher;
    return sortByEstimativaDesc(a, b);
};

const filterLogic = {
    finishedPlus: row =>
        row.status.toLowerCase() === 'finalizada' &&
        ['voucher', 'cartao no app', 'cartao app', 'saldo+cartao no app'].includes(normalizeText(row.formaPagamento)) &&
        row.porcentagem !== null && row.porcentagem > 20,

    finished: row =>
        row.status.toLowerCase() === 'finalizada' &&
        !['voucher', 'cartao no app', 'cartao app', 'saldo+cartao no app'].includes(normalizeText(row.formaPagamento)) &&
        row.porcentagem !== null && row.porcentagem < -20,

    canceled: row => {
        const forma = normalizeText(row.formaPagamento);
        return row.status.toLowerCase() === 'cancelada' &&
            ((row.valorCorrida !== null && row.valorCorrida > 25) || forma === 'voucher');
    },

    highValue: row => {
        const forma = normalizeText(row.formaPagamento);
        const valor = parseCurrencyToNumber(row.valorFinal);
        return row.status.toLowerCase() === 'finalizada' &&
            ['voucher', 'cartao no app', 'cartao app', 'saldo+cartao no app'].includes(forma) &&
            valor > 100;
    },

    default: row =>
        row.status.toLowerCase() === 'finalizada' &&
        row.porcentagem !== null && Math.abs(row.porcentagem) > 20
};

// =====================
// 🔹 PROCESSAMENTO DE ARQUIVO 🔹
// =====================
function processFile(event) {
    const fileInput = document.getElementById('fileInput').files[0];
    if (!fileInput) {
        if (!event || event.type !== 'change') alert('Por favor, selecione um arquivo.');
        return;
    }

    document.getElementById('loadingMessage').style.display = 'block';

    const reader = new FileReader();
    reader.onload = function (e) {
        Papa.parse(e.target.result, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                parsedData = results.data.map(parseRow).filter(row => row !== null);
                currentFilter = '';
                applyFilters();
                document.getElementById('loadingMessage').style.display = 'none';
            },
            error: function (err) {
                console.error('Erro ao processar o arquivo:', err);
                alert('Ocorreu um erro ao processar o arquivo. Tente novamente.');
                document.getElementById('loadingMessage').style.display = 'none';
            }
        });
    };
    reader.readAsText(fileInput, 'ISO-8859-1');
}

// =====================
// 🔹 PARSE DE LINHA CSV 🔹
// =====================
function parseRow(row) {
    const motorista = row['Motorista'];
    if (!motorista || motorista.trim().toUpperCase() === 'N/A') return null;

    const estimativaStr = row['Estimativa do valor da corrida'];
    const valorCorridaOriginal = row['Valor da corrida'];
    const status = row['Status'] || 'N/A';
    const formaPagamento = row['Forma de pagamento'] || 'N/A';
    const valorAdicionalStr = row['Valor extra'] || '';

    if (!estimativaStr && status.toLowerCase() !== 'cancelada') return null;

    const estimativaValor = parseCurrencyToNumber(estimativaStr);
    const valorCorridaNum = valorCorridaOriginal ? parseCurrencyToNumber(valorCorridaOriginal) : null;
    const valorAdicional = parseCurrencyToNumber(valorAdicionalStr);

    let diferenca = 0, diferencaStr = 'R$ 0,00', valorFinal = 'N/A', porcentagem = null;

    if (status.toLowerCase() === 'cancelada') {
        valorFinal = valorCorridaOriginal ? `R$ ${valorCorridaOriginal}` : 'R$ 0,00';
    } else if (valorCorridaNum !== null) {
        diferenca = valorCorridaNum - estimativaValor;
        const sinal = diferenca >= 0 ? '+' : '';
        diferencaStr = `${sinal}R$ ${Math.abs(diferenca).toFixed(2).replace('.', ',')}`;
        valorFinal = `R$ ${valorCorridaOriginal}`;
        porcentagem = (estimativaValor > 0) ? ((valorCorridaNum - estimativaValor) / estimativaValor) * 100 : null;
    }

    const taxaExtra = valorAdicional > 0 ? `R$ ${valorAdicional.toFixed(2).replace('.', ',')}` : '';

    return {
        os: row['Nº OS'] || 'N/A',
        status,
        motorista,
        formaPagamento,
        estimativa: estimativaStr ? `R$ ${estimativaStr}` : 'N/A',
        valorFinal,
        diferenca,
        diferencaStr,
        porcentagem,
        valorCorrida: valorCorridaNum,
        taxaExtra
    };
}

// =====================
// 🔹 FILTROS E PAGINAÇÃO 🔹
// =====================
function applyFilters() {
    if (!parsedData.length) return;

    const baseFilter = row => row.motorista.toUpperCase() !== 'N/A';
    const filterKey = currentFilter || 'default';
    const specificFilter = filterLogic[filterKey] || filterLogic['default'];

    filteredData = parsedData.filter(row => baseFilter(row) && specificFilter(row));

    if (currentFilter === 'canceled') filteredData.sort(sortCanceled);
    else if (currentFilter === 'highValue') filteredData.sort(sortByFinalValueDesc);
    else filteredData.sort(sortByEstimativaDesc);

    currentPage = 1;
    paginateData();
}

// =====================
// 🔹 RENDERIZAÇÃO DA TABELA 🔹
// =====================
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
        tbody.innerHTML = '<tr><td colspan="8">Nenhum dado encontrado</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();

    data.forEach(row => {
        const tr = document.createElement('tr');
        if (normalizeText(row.formaPagamento) === 'voucher') tr.classList.add('voucher-row');

        tr.innerHTML = `
            <td>${row.os}</td>
            <td>${row.status}</td>
            <td>${row.motorista}</td>
            <td>${row.formaPagamento}</td>
            <td>${row.estimativa}</td>
            <td>${row.valorFinal}</td>
            <td>${row.diferencaStr}</td>
            <td>${row.taxaExtra}</td>
        `;
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
}

function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.classList.add('page-button');
        if (i === currentPage) btn.classList.add('active');
        btn.addEventListener('click', () => {
            currentPage = i;
            paginateData();
        });
        fragment.appendChild(btn);
    }
    container.appendChild(fragment);
}

// =====================
// 🔹 EVENT LISTENERS 🔹
// =====================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('processButton').addEventListener('click', processFile);
    document.getElementById('fileInput').addEventListener('change', processFile);

    document.getElementById('btn-finished-plus').addEventListener('click', () => {
        currentFilter = 'finishedPlus';
        applyFilters();
    });

    document.getElementById('btn-finished').addEventListener('click', () => {
        currentFilter = 'finished';
        applyFilters();
    });

    document.getElementById('btn-canceled').addEventListener('click', () => {
        currentFilter = 'canceled';
        applyFilters();
    });

    document.getElementById('btn-highValue').addEventListener('click', () => {
        currentFilter = 'highValue';
        applyFilters();
    });
});
