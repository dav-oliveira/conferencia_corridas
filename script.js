// =====================
// 🔹 VARIÁVEIS GLOBAIS 🔹
// =====================
let parsedData = [];
let filteredData = [];
let driverAnalysis = {};
let currentPage = 1;
const rowsPerPage = 15;
let currentFilter = 'all';
let currentDriverFilter = 'all';

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

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// =====================
// 🔹 CÁLCULO DE RISCO 🔹
// =====================
function calculateRideRiskScore(ride) {
    let score = 0;
    let factors = [];

    const priceDeviation = Math.abs(ride.porcentagem);
    if (priceDeviation > 50) {
        score += 30;
        factors.push('Divergência extrema (>50%)');
    } else if (priceDeviation > 30) {
        score += 20;
        factors.push('Divergência alta (30-50%)');
    } else if (priceDeviation > 20) {
        score += 10;
        factors.push('Divergência moderada (20-30%)');
    }

    const formaPagamento = normalizeText(ride.formaPagamento);
    if (formaPagamento === 'voucher' || formaPagamento.includes('cartao')) {
        if (priceDeviation > 30) {
            score += 25;
            factors.push('Pagamento digital com divergência alta');
        } else if (priceDeviation > 15) {
            score += 15;
            factors.push('Pagamento digital com divergência moderada');
        }
    }

    if (ride.rotaAlterada === 'SIM' || ride.rotaAlterada === 'sim') {
        if (priceDeviation > 30) {
            score += 10;
            factors.push('Rota alterada + divergência alta');
        } else {
            score -= 5;
        }
    } else if (priceDeviation > 20) {
        score += 15;
        factors.push('Divergência SEM alteração de rota');
    }

    if (ride.valoresAdicionais > 0) {
        const taxaPercentage = (ride.valoresAdicionais / ride.estimativa) * 100;
        if (taxaPercentage > 30) {
            score += 15;
            factors.push(`Taxa extra alta (${taxaPercentage.toFixed(1)}%)`);
        } else if (taxaPercentage > 15) {
            score += 8;
            factors.push(`Taxa extra moderada (${taxaPercentage.toFixed(1)}%)`);
        }
    }

    if (ride.porcentagem < -30) {
        score += 35;
        factors.push('⚠️ CRÍTICO: Motorista finalizou cedo');
    }

    score = Math.max(0, Math.min(100, score));

    const riskLevel = score > 70 ? 'CRÍTICO' : score > 50 ? 'ALTO' : score > 30 ? 'MÉDIO' : 'BAIXO';

    return {
        score,
        factors,
        riskLevel
    };
}

// =====================
// 🔹 PARSE DE LINHA CSV 🔹
// =====================
function parseRow(row) {
    const motorista = row['Motorista'];
    if (!motorista || motorista.trim().toUpperCase() === 'N/A') return null;

    const estimativaStr = row['Estimativa do valor da corrida'];
    const valorCorridaStr = row['Valor da corrida'];
    const status = row['Status'] || 'N/A';
    const formaPagamento = row['Forma de pagamento'] || 'N/A';
    const valoresAdicionaisStr = row['Valores adicionais'] || '0';
    const destinoInformado = row['Destino informado'] || 'N/A';
    const localEncerramento = row['Local de encerramento'] || 'N/A';
    const distanciaEstimada = parseFloat(row['Estimativa de distância da corrida (KM)']) || 0;
    const distanciaReal = parseFloat(row['Distância do início da corrida até o local de encerramento']) || 0;

    // CORREÇÃO: Remover filtro que eliminava corridas sem estimativa
    // Agora aceita TODAS as corridas, mesmo sem estimativa
    const estimativaValor = parseCurrencyToNumber(estimativaStr);
    const valorCorridaNum = valorCorridaStr ? parseCurrencyToNumber(valorCorridaStr) : null;
    const valoresAdicionais = parseCurrencyToNumber(valoresAdicionaisStr);

    let diferenca = 0, diferencaStr = 'R$ 0,00', porcentagem = null;

    if (valorCorridaNum !== null) {
        diferenca = valorCorridaNum - estimativaValor;
        const sinal = diferenca >= 0 ? '+' : '';
        diferencaStr = `${sinal}R$ ${Math.abs(diferenca).toFixed(2).replace('.', ',')}`;
        porcentagem = (estimativaValor > 0) ? ((valorCorridaNum - estimativaValor) / estimativaValor) * 100 : null;
    }

    const rotaAlterada = destinoInformado !== localEncerramento && localEncerramento !== 'N/A' ? 'SIM' : 'NÃO';

    const parsed = {
        os: String(row['Nº OS'] || 'N/A').trim(), // CORREÇÃO: Garantir que OS é string completa
        status,
        motorista,
        formaPagamento,
        estimativa: estimativaValor,
        estimativaStr: estimativaStr ? `R$ ${estimativaStr}` : 'N/A',
        valorFinal: valorCorridaNum,
        valorFinalStr: valorCorridaStr ? `R$ ${valorCorridaStr}` : 'N/A',
        diferenca,
        diferencaStr,
        porcentagem: porcentagem || 0,
        valoresAdicionais,
        valoresAdicionaisStr: valoresAdicionais > 0 ? `R$ ${valoresAdicionais.toFixed(2).replace('.', ',')}` : '',
        destinoInformado,
        localEncerramento,
        rotaAlterada,
        distanciaEstimada,
        distanciaReal
    };

    const risco = calculateRideRiskScore(parsed);
    parsed.riskScore = risco.score;
    parsed.riskLevel = risco.riskLevel;
    parsed.riskFactors = risco.factors;

    return parsed;
}

// =====================
// 🔹 ANÁLISE COMPORTAMENTAL 🔹
// =====================
function analyzeDriverBehavior() {
    driverAnalysis = {};

    parsedData.forEach(ride => {
        if (!driverAnalysis[ride.motorista]) {
            driverAnalysis[ride.motorista] = {
                motorista: ride.motorista,
                totalCorridas: 0,
                corridasSuspeitas: 0,
                riskScores: [],
                redFlags: []
            };
        }

        driverAnalysis[ride.motorista].totalCorridas++;
        driverAnalysis[ride.motorista].riskScores.push(ride.riskScore);

        if (ride.riskScore > 50) {
            driverAnalysis[ride.motorista].corridasSuspeitas++;
        }
    });

    const allRiskScores = [];
    Object.keys(driverAnalysis).forEach(motorista => {
        const driver = driverAnalysis[motorista];
        const scores = driver.riskScores;
        
        driver.taxaFraude = (driver.corridasSuspeitas / driver.totalCorridas) * 100;
        driver.riskScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        driver.riskLevel = driver.riskScore > 70 ? 'CRÍTICO' : driver.riskScore > 50 ? 'ALTO' : driver.riskScore > 30 ? 'MÉDIO' : 'BAIXO';

        allRiskScores.push(driver.riskScore);
    });

    const baseline = allRiskScores.reduce((a, b) => a + b, 0) / allRiskScores.length;

    Object.keys(driverAnalysis).forEach(motorista => {
        const driver = driverAnalysis[motorista];
        driver.desvioVsMedia = driver.riskScore - baseline;
    });

    return driverAnalysis;
}

// =====================
// 🔹 ANÁLISE DE ROTA 🔹
// =====================
function analyzeRouteDeviation(ride) {
    if (ride.rotaAlterada === 'SIM' || ride.rotaAlterada === 'sim') {
        return null;
    }

    const divergenciaDistancia = ride.distanciaEstimada > 0 
        ? ((ride.distanciaReal - ride.distanciaEstimada) / ride.distanciaEstimada) * 100 
        : 0;

    const divergenciaPreco = ride.estimativa > 0 
        ? ((ride.valorFinal - ride.estimativa) / ride.estimativa) * 100 
        : 0;

    let correlacao = 'NORMAL';
    let status = '✅ OK';

    if (divergenciaPreco > 20 && divergenciaDistancia < 10) {
        correlacao = 'SUSPEITO';
        status = '⚠️ INVESTIGAR';
    } else if (divergenciaPreco > 0 && divergenciaDistancia < 0) {
        correlacao = 'SUSPEITO';
        status = '⚠️ INVESTIGAR';
    } else if (Math.abs(divergenciaPreco - divergenciaDistancia) < 10) {
        correlacao = 'JUSTIFICÁVEL';
        status = '✅ OK';
    }

    return {
        os: ride.os,
        motorista: ride.motorista,
        distanciaEstimada: ride.distanciaEstimada,
        distanciaReal: ride.distanciaReal,
        divergenciaDistancia: divergenciaDistancia.toFixed(2),
        precoEstimado: ride.estimativa,
        precoReal: ride.valorFinal,
        divergenciaPreco: divergenciaPreco.toFixed(2),
        correlacao,
        status,
        riskScore: ride.riskScore // Adicionar para ordenação
    };
}

// =====================
// 🔹 ALERTAS 🔹
// =====================
function showAlert(message, type = 'info') {
    const container = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `<i class="fas fa-bell"></i> ${message}`;
    container.appendChild(alert);

    setTimeout(() => {
        alert.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => alert.remove(), 300);
    }, 5000);
}

function playAlertSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

function showCriticalAlert(ride) {
    const modal = document.getElementById('criticalAlertModal');
    const body = document.getElementById('alertModalBody');

    body.innerHTML = `
        <div class="modal-detail-row">
            <strong>Nº OS:</strong>
            <span>${ride.os}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Motorista:</strong>
            <span>${ride.motorista}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Forma de Pagamento:</strong>
            <span>${ride.formaPagamento}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Estimativa:</strong>
            <span>${ride.estimativaStr}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Valor Final:</strong>
            <span>${ride.valorFinalStr}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Diferença:</strong>
            <span>${ride.diferencaStr} (${ride.porcentagem.toFixed(2)}%)</span>
        </div>
        <div class="modal-detail-row">
            <strong>Risk Score:</strong>
            <span class="risk-critical">${ride.riskScore.toFixed(1)}/100</span>
        </div>
        <div class="modal-detail-row">
            <strong>Fatores:</strong>
            <span>${ride.riskFactors.join(', ')}</span>
        </div>
    `;

    modal.classList.add('show');
}

function closeCriticalAlert() {
    const modal = document.getElementById('criticalAlertModal');
    modal.classList.remove('show');
}

// =====================
// 🔹 FILTROS 🔹
// =====================
const filterLogic = {
    all: () => true,
    'high-risk': (row) => row.riskScore > 50,
    'voucher': (row) => normalizeText(row.formaPagamento).includes('voucher'),
    'cartao-app': (row) => {
        const forma = normalizeText(row.formaPagamento);
        return forma.includes('cartao') && forma.includes('app');
    },
    'dinheiro': (row) => normalizeText(row.formaPagamento) === 'dinheiro'
};

function applyFilters() {
    if (!parsedData.length) return;

    const filterFunc = filterLogic[currentFilter] || filterLogic['all'];
    filteredData = parsedData.filter(filterFunc);
    
    // CORREÇÃO: Ordenar SEMPRE por criticidade (CRÍTICO → ALTO → MÉDIO → BAIXO)
    filteredData.sort((a, b) => b.riskScore - a.riskScore);

    currentPage = 1;
    updateStats();
    paginateData();
}

// =====================
// 🔹 ESTATÍSTICAS 🔹
// =====================
function updateStats() {
    const total = parsedData.length;
    const critical = parsedData.filter(r => r.riskScore > 70).length;
    const high = parsedData.filter(r => r.riskScore > 50 && r.riskScore <= 70).length;
    const medium = parsedData.filter(r => r.riskScore > 30 && r.riskScore <= 50).length;

    document.getElementById('stat-total').textContent = total.toLocaleString('pt-BR');
    document.getElementById('stat-critical').textContent = critical;
    document.getElementById('stat-high').textContent = high;
    document.getElementById('stat-medium').textContent = medium;
}

// =====================
// 🔹 RENDERIZAÇÃO - CORRIDAS 🔹
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
        document.getElementById('noDataMessage').style.display = 'block';
        return;
    }

    document.getElementById('noDataMessage').style.display = 'none';

    const fragment = document.createDocumentFragment();

    data.forEach(row => {
        const tr = document.createElement('tr');
        const riskClass = row.riskScore > 70 ? 'risk-critical' : row.riskScore > 50 ? 'risk-high' : row.riskScore > 30 ? 'risk-medium' : 'risk-low';

        tr.innerHTML = `
            <td>${row.os}</td>
            <td>${row.motorista}</td>
            <td>${row.formaPagamento}</td>
            <td>${row.estimativaStr}</td>
            <td>${row.valorFinalStr}</td>
            <td>${row.diferencaStr}</td>
            <td>${row.valoresAdicionaisStr}</td>
            <td><span class="${riskClass}">${row.riskLevel}</span></td>
            <td><button class="btn-details" onclick="showDetails('${row.os}')">Ver</button></td>
        `;
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
}

function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';

    if (totalPages <= 1) return;

    const fragment = document.createDocumentFragment();

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
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
// 🔹 RENDERIZAÇÃO - MOTORISTAS 🔹
// =====================
function renderDriverTable() {
    const tbody = document.querySelector('#driverTable tbody');
    tbody.innerHTML = '';

    let drivers = Object.values(driverAnalysis);

    if (currentDriverFilter !== 'all') {
        drivers = drivers.filter(d => {
            if (currentDriverFilter === 'critico') return d.riskScore > 70;
            if (currentDriverFilter === 'alto') return d.riskScore > 50 && d.riskScore <= 70;
            if (currentDriverFilter === 'medio') return d.riskScore > 30 && d.riskScore <= 50;
            return true;
        });
    }

    // CORREÇÃO: Ordenar SEMPRE por criticidade (CRÍTICO primeiro)
    drivers.sort((a, b) => b.riskScore - a.riskScore);

    if (drivers.length === 0) {
        document.getElementById('noDriverData').style.display = 'block';
        return;
    }

    document.getElementById('noDriverData').style.display = 'none';

    const fragment = document.createDocumentFragment();

    drivers.forEach(driver => {
        const tr = document.createElement('tr');
        const riskClass = driver.riskScore > 70 ? 'risk-critical' : driver.riskScore > 50 ? 'risk-high' : driver.riskScore > 30 ? 'risk-medium' : 'risk-low';
        const desvioClass = driver.desvioVsMedia > 0 ? 'risk-high' : 'risk-low';

        tr.innerHTML = `
            <td><strong>${driver.motorista}</strong></td>
            <td>${driver.totalCorridas}</td>
            <td>${driver.corridasSuspeitas}</td>
            <td>${driver.taxaFraude.toFixed(1)}%</td>
            <td>${driver.riskScore.toFixed(1)}</td>
            <td><span class="${desvioClass}">${driver.desvioVsMedia > 0 ? '+' : ''}${driver.desvioVsMedia.toFixed(1)}</span></td>
            <td><span class="${riskClass}">${driver.riskLevel}</span></td>
            <td><button class="btn-details" onclick="showDriverDetails('${driver.motorista}')">Ver</button></td>
        `;
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
}

// =====================
// 🔹 RENDERIZAÇÃO - ROTAS 🔹
// =====================
function renderRouteTable() {
    const tbody = document.querySelector('#routeTable tbody');
    tbody.innerHTML = '';

    const routes = parsedData
        .map(analyzeRouteDeviation)
        .filter(r => r !== null);

    if (routes.length === 0) {
        document.getElementById('noRouteData').style.display = 'block';
        return;
    }

    document.getElementById('noRouteData').style.display = 'none';

    // CORREÇÃO: Ordenar SEMPRE por criticidade (SUSPEITO primeiro, depois JUSTIFICÁVEL)
    routes.sort((a, b) => {
        // Suspeito = 1, Justificável = 0
        const aSuspeito = a.correlacao === 'SUSPEITO' ? 1 : 0;
        const bSuspeito = b.correlacao === 'SUSPEITO' ? 1 : 0;
        
        if (aSuspeito !== bSuspeito) {
            return bSuspeito - aSuspeito; // Suspeito primeiro
        }
        
        // Se ambos são suspeitos, ordenar por risk score
        return b.riskScore - a.riskScore;
    });

    const fragment = document.createDocumentFragment();

    routes.forEach(route => {
        const tr = document.createElement('tr');
        const correlacaoClass = route.correlacao === 'SUSPEITO' ? 'correlation-suspeito' : 'correlation-justificavel';

        tr.innerHTML = `
            <td>${route.os}</td>
            <td>${route.motorista}</td>
            <td>${route.distanciaEstimada.toFixed(2)}</td>
            <td>${route.distanciaReal.toFixed(2)}</td>
            <td>${route.divergenciaDistancia}%</td>
            <td>${formatCurrency(route.precoEstimado)}</td>
            <td>${formatCurrency(route.precoReal)}</td>
            <td>${route.divergenciaPreco}%</td>
            <td><span class="${correlacaoClass}">${route.correlacao}</span></td>
            <td>${route.status}</td>
        `;
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
}

// =====================
// 🔹 MODAL DE DETALHES 🔹
// =====================
function showDetails(os) {
    const ride = parsedData.find(r => r.os === os);
    if (!ride) return;

    const modal = document.getElementById('detailsModal');
    const modalBody = document.getElementById('modalBody');

    let detailsHTML = `
        <div class="modal-detail-row">
            <strong>Nº OS:</strong>
            <span>${ride.os}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Motorista:</strong>
            <span>${ride.motorista}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Forma de Pagamento:</strong>
            <span>${ride.formaPagamento}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Estimativa:</strong>
            <span>${ride.estimativaStr}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Valor Final:</strong>
            <span>${ride.valorFinalStr}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Diferença:</strong>
            <span>${ride.diferencaStr} (${ride.porcentagem.toFixed(2)}%)</span>
        </div>
        <div class="modal-detail-row">
            <strong>Taxa Extra:</strong>
            <span>${ride.valoresAdicionaisStr || 'R$ 0,00'}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Destino Informado:</strong>
            <span>${ride.destinoInformado}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Local de Encerramento:</strong>
            <span>${ride.localEncerramento}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Rota Alterada:</strong>
            <span>${ride.rotaAlterada}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Distância Estimada:</strong>
            <span>${ride.distanciaEstimada.toFixed(2)} km</span>
        </div>
        <div class="modal-detail-row">
            <strong>Distância Real:</strong>
            <span>${ride.distanciaReal.toFixed(2)} km</span>
        </div>
        <div class="modal-detail-row">
            <strong>Score de Risco:</strong>
            <span class="risk-${ride.riskScore > 70 ? 'critical' : ride.riskScore > 50 ? 'high' : 'medium'}">${ride.riskScore.toFixed(1)}/100 - ${ride.riskLevel}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Fatores de Risco:</strong>
            <span>${ride.riskFactors.join(', ') || 'Nenhum'}</span>
        </div>
    `;

    modalBody.innerHTML = detailsHTML;
    modal.classList.add('show');
}

function showDriverDetails(motorista) {
    const driver = driverAnalysis[motorista];
    if (!driver) return;

    const driverRides = parsedData.filter(r => r.motorista === motorista);
    const suspiciousRides = driverRides.filter(r => r.riskScore > 50);

    const modal = document.getElementById('driverModal');
    const modalBody = document.getElementById('driverModalBody');

    let detailsHTML = `
        <div class="modal-detail-row">
            <strong>Motorista:</strong>
            <span>${driver.motorista}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Total de Corridas:</strong>
            <span>${driver.totalCorridas}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Corridas Suspeitas:</strong>
            <span>${driver.corridasSuspeitas}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Taxa de Fraude:</strong>
            <span>${driver.taxaFraude.toFixed(1)}%</span>
        </div>
        <div class="modal-detail-row">
            <strong>Risk Score:</strong>
            <span class="risk-${driver.riskScore > 70 ? 'critical' : driver.riskScore > 50 ? 'high' : 'medium'}">${driver.riskScore.toFixed(1)}/100</span>
        </div>
        <div class="modal-detail-row">
            <strong>Nível de Risco:</strong>
            <span class="risk-${driver.riskScore > 70 ? 'critical' : driver.riskScore > 50 ? 'high' : 'medium'}">${driver.riskLevel}</span>
        </div>
        <div class="modal-detail-row">
            <strong>Desvio vs. Média:</strong>
            <span>${driver.desvioVsMedia > 0 ? '+' : ''}${driver.desvioVsMedia.toFixed(1)}</span>
        </div>
        <hr style="margin: 1rem 0;">
        <h3 style="margin-bottom: 1rem;">Corridas Suspeitas (${suspiciousRides.length}):</h3>
    `;

    suspiciousRides.slice(0, 5).forEach(ride => {
        detailsHTML += `
            <div class="modal-detail-row">
                <strong>OS ${ride.os}:</strong>
                <span>${ride.diferencaStr} (${ride.porcentagem.toFixed(1)}%) - ${ride.riskLevel}</span>
            </div>
        `;
    });

    if (suspiciousRides.length > 5) {
        detailsHTML += `<p style="color: #7f8c8d; font-size: 0.9rem;">... e mais ${suspiciousRides.length - 5} corridas</p>`;
    }

    modalBody.innerHTML = detailsHTML;
    modal.classList.add('show');
}

// =====================
// 🔹 PROCESSAMENTO DE ARQUIVO 🔹
// =====================
function processFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
        alert('Por favor, selecione um arquivo.');
        return;
    }

    document.getElementById('loadingMessage').classList.add('show');

    const reader = new FileReader();
    reader.onload = function (e) {
        Papa.parse(e.target.result, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                // CORREÇÃO: Remover filtro que eliminava corridas
                parsedData = results.data
                    .map(parseRow)
                    .filter(row => row !== null);

                if (parsedData.length === 0) {
                    alert('Nenhum dado válido encontrado no arquivo.');
                    document.getElementById('loadingMessage').classList.remove('show');
                    return;
                }

                analyzeDriverBehavior();

                parsedData.forEach(ride => {
                    if (ride.riskScore > 70) {
                        showAlert(`🚨 FRAUDE CRÍTICA: ${ride.motorista} - OS ${ride.os}`, 'critical');
                        playAlertSound();
                    }
                });

                currentFilter = 'all';
                currentDriverFilter = 'all';
                applyFilters();
                renderDriverTable();
                renderRouteTable();

                document.getElementById('loadingMessage').classList.remove('show');
                alert(`✅ Arquivo processado com sucesso! ${parsedData.length.toLocaleString('pt-BR')} corridas analisadas.`);
            },
            error: function (err) {
                console.error('Erro ao processar arquivo:', err);
                alert('Erro ao processar o arquivo. Verifique o formato.');
                document.getElementById('loadingMessage').classList.remove('show');
            }
        });
    };
    reader.readAsText(file, 'ISO-8859-1');
}

// =====================
// 🔹 DADOS DE TESTE 🔹
// =====================
function loadSampleData() {
    const sampleCSV = `Nº OS,Status,Motorista,Forma de pagamento,Estimativa do valor da corrida,Valor da corrida,Valores adicionais,Destino informado,Local de encerramento,Estimativa de distância da corrida (KM),Distância do início da corrida até o local de encerramento
123456789,finalizada,João Silva,voucher,R$ 25.00,R$ 45.00,R$ 0.00,Rua A 123,Rua B 456,5.0,8.2
123456790,finalizada,João Silva,cartao app,R$ 20.00,R$ 15.00,R$ 0.00,Rua C 789,Rua C 789,4.0,3.8
123456791,finalizada,Maria Santos,dinheiro,R$ 30.00,R$ 32.00,R$ 2.00,Rua D 321,Rua D 321,6.0,6.1
123456792,finalizada,João Silva,voucher,R$ 50.00,R$ 95.00,R$ 0.00,Rua E 654,Rua F 987,10.0,10.5
123456793,finalizada,Pedro Costa,cartao app,R$ 15.00,R$ 14.00,R$ 0.00,Rua G 111,Rua G 111,3.0,2.9
123456794,finalizada,Maria Santos,dinheiro,R$ 40.00,R$ 42.00,R$ 0.00,Rua H 222,Rua H 222,8.0,8.2
123456795,finalizada,João Silva,voucher,R$ 35.00,R$ 12.00,R$ 0.00,Rua I 333,Rua I 333,7.0,2.5
123456796,finalizada,Pedro Costa,cartao app,R$ 25.00,R$ 55.00,R$ 5.00,Rua J 444,Rua K 555,5.0,5.3
123456797,finalizada,Ana Oliveira,dinheiro,R$ 20.00,R$ 21.00,R$ 1.00,Rua L 666,Rua L 666,4.0,4.1
123456798,finalizada,João Silva,voucher,R$ 60.00,R$ 120.00,R$ 0.00,Rua M 777,Rua N 888,12.0,12.8
123456799,finalizada,Maria Santos,cartao app,R$ 18.00,R$ 19.00,R$ 0.00,Rua O 999,Rua O 999,3.5,3.6
123456800,finalizada,Pedro Costa,dinheiro,R$ 45.00,R$ 48.00,R$ 0.00,Rua P 101,Rua P 101,9.0,9.3
123456801,finalizada,Ana Oliveira,voucher,R$ 22.00,R$ 23.00,R$ 0.00,Rua Q 202,Rua Q 202,4.5,4.6
123456802,finalizada,João Silva,cartao app,R$ 55.00,R$ 100.00,R$ 0.00,Rua R 303,Rua S 404,11.0,11.5
123456803,finalizada,Carlos Mendes,dinheiro,R$ 30.00,R$ 31.00,R$ 0.00,Rua T 505,Rua T 505,6.0,6.1
123456804,finalizada,Maria Santos,voucher,R$ 25.00,R$ 26.00,R$ 0.00,Rua U 606,Rua U 606,5.0,5.1
123456805,finalizada,João Silva,cartao app,R$ 40.00,R$ 75.00,R$ 0.00,Rua V 707,Rua W 808,8.0,8.5
123456806,finalizada,Pedro Costa,dinheiro,R$ 35.00,R$ 36.00,R$ 0.00,Rua X 909,Rua X 909,7.0,7.1
123456807,finalizada,Ana Oliveira,voucher,R$ 28.00,R$ 29.00,R$ 0.00,Rua Y 010,Rua Y 010,5.5,5.6
123456808,finalizada,Carlos Mendes,cartao app,R$ 50.00,R$ 95.00,R$ 0.00,Rua Z 111,Rua Z 111,10.0,10.5`;

    Papa.parse(sampleCSV, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
            parsedData = results.data
                .map(parseRow)
                .filter(row => row !== null);

            analyzeDriverBehavior();

            parsedData.forEach(ride => {
                if (ride.riskScore > 70) {
                    showAlert(`🚨 FRAUDE CRÍTICA: ${ride.motorista} - OS ${ride.os}`, 'critical');
                    playAlertSound();
                }
            });

            currentFilter = 'all';
            currentDriverFilter = 'all';
            applyFilters();
            renderDriverTable();
            renderRouteTable();

            alert(`✅ Dados de teste carregados! ${parsedData.length} corridas analisadas.`);
        }
    });
}

// =====================
// 🔹 EXPORTAÇÃO 🔹
// =====================
function exportToCSV() {
    if (filteredData.length === 0) {
        alert('Nenhum dado para exportar.');
        return;
    }

    const headers = ['Nº OS', 'Motorista', 'Forma de Pagamento', 'Estimativa', 'Valor Final', 'Diferença', 'Taxa Extra', 'Risco', 'Score'];
    
    const rows = filteredData.map(row => [
        row.os,
        row.motorista,
        row.formaPagamento,
        row.estimativa,
        row.valorFinal,
        row.diferenca,
        row.valoresAdicionais,
        row.riskLevel,
        row.riskScore.toFixed(2)
    ]);

    const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `analise_divergencia_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

// =====================
// 🔹 EVENT LISTENERS 🔹
// =====================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('processButton').addEventListener('click', processFile);
    document.getElementById('fileInput').addEventListener('change', processFile);
    document.getElementById('loadSampleData').addEventListener('click', loadSampleData);

    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            applyFilters();
        });
    });

    document.querySelectorAll('.btn-filter-driver').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-filter-driver').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDriverFilter = btn.dataset.filterDriver;
            renderDriverTable();
        });
    });

    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        });
    });

    document.getElementById('exportBtn').addEventListener('click', exportToCSV);

    const modals = [
        { id: 'detailsModal', closeBtn: true },
        { id: 'driverModal', closeBtn: true },
        { id: 'criticalAlertModal', closeBtn: false }
    ];

    modals.forEach(({ id }) => {
        const modal = document.getElementById(id);
        const closeBtn = modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('show');
            });
        }
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
});