// =====================
// 🔹 VARIÁVEIS GLOBAIS 🔹
// =====================
let parsedData = [];
let filteredData = [];
let currentPage = 1;
const rowsPerPage = 15;
let currentFilter = '';
let currentDetailOS = '';
let incluirTodasCanceladas = false; // ← NOVO: Controla modo de canceladas

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
        const isCanceled = row.status.toLowerCase() === 'cancelada' &&
            ((row.valorCorrida !== null && row.valorCorrida > 25) || forma === 'voucher');
        
        if (isCanceled) {
            // ✅ SE modo "Incluir Todas" está ativo → Mostrar tudo
            if (incluirTodasCanceladas) {
                return true; // Mostrar sem filtro
            }
            
            // ✅ SENÃO → Aplicar filtro inteligente
            if (row.distanciaRealAceite === 0 && row.distanciaEstimadaAceite > 0) {
                return false; // Descartar
            }
            return true; // Mostrar
        }
        
        return false;
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
        if (!event || event.type !== 'change') {
            alert('Por favor, selecione um arquivo.');
        }
        return;
    }

    document.getElementById('loadingMessage').classList.add('show');

    const reader = new FileReader();
    reader.onload = function (e) {
        Papa.parse(e.target.result, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                parsedData = results.data.map(parseRow).filter(row => row !== null);
                currentFilter = '';
                incluirTodasCanceladas = false; // ← Reset ao carregar novo arquivo
                updateCanceledButtonState();
                applyFilters();
                document.getElementById('loadingMessage').classList.remove('show');
            },
            error: function (err) {
                console.error('Erro ao processar o arquivo:', err);
                alert('Ocorreu um erro ao processar o arquivo. Tente novamente.');
                document.getElementById('loadingMessage').classList.remove('show');
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
    
    const distanciaEstimadaAceite = parseFloat(row['Estimativa de distância até o passageiro no aceite (KM)']) || 0;
    const distanciaRealAceite = parseFloat(row['Distância realizada até o passageiro no aceite (KM)']) || 0;

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
        taxaExtra,
        distanciaEstimadaAceite,
        distanciaRealAceite
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
        tbody.innerHTML = '<tr><td colspan="9">Nenhum dado encontrado</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();

    data.forEach(row => {
        const tr = document.createElement('tr');
        if (normalizeText(row.formaPagamento) === 'voucher') tr.classList.add('voucher-row');

        let acaoHTML = '';
        if (row.status.toLowerCase() === 'cancelada') {
            acaoHTML = `<button class="btn-details" onclick="showDetails('${row.os}')"><i class="fas fa-eye"></i> Detalhes</button>`;
        }

        tr.innerHTML = `
            <td>${row.os}</td>
            <td>${row.status}</td>
            <td>${row.motorista}</td>
            <td>${row.formaPagamento}</td>
            <td>${row.estimativa}</td>
            <td>${row.valorFinal}</td>
            <td>${row.diferencaStr}</td>
            <td>${row.taxaExtra}</td>
            <td>${acaoHTML}</td>
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
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        fragment.appendChild(btn);
    }
    container.appendChild(fragment);
}

// =====================
// 🔹 MODAL DE DETALHES 🔹
// =====================
function showDetails(os) {
    const ride = parsedData.find(r => r.os === os);
    if (!ride) return;

    currentDetailOS = os;

    const divergenciaDistancia = ride.distanciaEstimadaAceite > 0 
        ? ((ride.distanciaRealAceite - ride.distanciaEstimadaAceite) / ride.distanciaEstimadaAceite) * 100 
        : 0;

    const percentualPercorrido = ride.distanciaEstimadaAceite > 0 
        ? (ride.distanciaRealAceite / ride.distanciaEstimadaAceite) * 100 
        : 0;

    let statusDistancia = '';
    let classeStatus = '';

    if (percentualPercorrido < 30) {
        statusDistancia = '🔴 Motorista percorreu muito pouco';
        classeStatus = 'highlight';
    } else if (percentualPercorrido < 70) {
        statusDistancia = '🟡 Motorista percorreu parcialmente';
        classeStatus = 'highlight';
    } else {
        statusDistancia = '🟢 Motorista percorreu a maior parte';
        classeStatus = 'success';
    }

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Nº OS:</span>
            <span class="detail-value">${ride.os}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Motorista:</span>
            <span class="detail-value">${ride.motorista}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Forma de Pagamento:</span>
            <span class="detail-value">${ride.formaPagamento}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value">${ride.status}</span>
        </div>
        <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--border-color);">
        <div class="detail-row">
            <span class="detail-label">Distância Estimada (Aceite → Embarque):</span>
            <span class="detail-value">${ride.distanciaEstimadaAceite.toFixed(2)} km</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Distância Real Percorrida:</span>
            <span class="detail-value">${ride.distanciaRealAceite.toFixed(2)} km</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Diferença:</span>
            <span class="detail-value">${divergenciaDistancia.toFixed(1)}%</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Percentual Percorrido:</span>
            <span class="detail-value ${classeStatus}">${percentualPercorrido.toFixed(1)}%</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Análise:</span>
            <span class="detail-value ${classeStatus}">${statusDistancia}</span>
        </div>
        <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--border-color);">
        <div class="detail-row">
            <span class="detail-label">Valor Estimado:</span>
            <span class="detail-value">${ride.estimativa}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Valor Final:</span>
            <span class="detail-value">${ride.valorFinal}</span>
        </div>
    `;

    document.getElementById('detailsModal').style.display = 'block';
    document.getElementById('modalOverlay').style.display = 'block';
}

// =====================
// 🔹 FUNÇÃO EXCLUIR 🔹
// =====================
function deleteRide() {
    if (!currentDetailOS) return;

    if (!confirm(`Tem certeza que deseja excluir a corrida ${currentDetailOS}?`)) {
        return;
    }

    parsedData = parsedData.filter(r => r.os !== currentDetailOS);
    closeModal();
    applyFilters();
    alert(`✅ Corrida ${currentDetailOS} excluída com sucesso!`);
}

function closeModal() {
    document.getElementById('detailsModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
    currentDetailOS = '';
}

document.addEventListener('click', (e) => {
    const modal = document.getElementById('detailsModal');
    if (e.target === document.getElementById('modalOverlay')) {
        closeModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// =====================
// 🔹 FUNÇÃO ATUALIZAR ESTADO DO BOTÃO 🔹
// =====================
function updateCanceledButtonState() {
    const btnCanceled = document.getElementById('btn-canceled');
    const btnCanceledAll = document.getElementById('btn-canceled-all');
    
    if (currentFilter === 'canceled') {
        btnCanceled.classList.add('active');
        
        if (incluirTodasCanceladas) {
            btnCanceledAll.classList.add('active');
        } else {
            btnCanceledAll.classList.remove('active');
        }
    } else {
        btnCanceled.classList.remove('active');
        btnCanceledAll.classList.remove('active');
    }
}

// =====================
// 🔹 EVENT LISTENERS 🔹
// =====================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fileInput').addEventListener('change', processFile);

    document.getElementById('btn-finished-plus').addEventListener('click', () => {
        currentFilter = 'finishedPlus';
        incluirTodasCanceladas = false;
        applyFilters();
        updateActiveButton('btn-finished-plus');
        updateCanceledButtonState();
    });

    document.getElementById('btn-finished').addEventListener('click', () => {
        currentFilter = 'finished';
        incluirTodasCanceladas = false;
        applyFilters();
        updateActiveButton('btn-finished');
        updateCanceledButtonState();
    });

    document.getElementById('btn-canceled').addEventListener('click', () => {
        currentFilter = 'canceled';
        incluirTodasCanceladas = false; // ← Reset ao clicar em "Canceladas"
        applyFilters();
        updateActiveButton('btn-canceled');
        updateCanceledButtonState();
    });

    // ✅ NOVO: Botão "Incluir Todas"
    document.getElementById('btn-canceled-all').addEventListener('click', () => {
        if (currentFilter !== 'canceled') {
            currentFilter = 'canceled';
            updateActiveButton('btn-canceled');
        }
        incluirTodasCanceladas = !incluirTodasCanceladas; // ← Toggle
        applyFilters();
        updateCanceledButtonState();
    });

    document.getElementById('btn-highValue').addEventListener('click', () => {
        currentFilter = 'highValue';
        incluirTodasCanceladas = false;
        applyFilters();
        updateActiveButton('btn-highValue');
        updateCanceledButtonState();
    });
});

function updateActiveButton(activeId) {
    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(activeId).classList.add('active');
}