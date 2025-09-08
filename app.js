import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', () => {
    // ESTADO DA APLICAÇÃO
    let appData = { services: [], tabelas: {} };
    let quote = {
        general: { clientName: '', clientCnpj: '', clientEmail: '', clientPhone: '', guestCount: 100, priceTable: '', discount: 0, dates: [] },
        items: []
    };
    const CATEGORY_ORDER = ['Espaço', 'Gastronomia', 'Equipamentos', 'Serviços / Outros'];

    // ELEMENTOS DO DOM
    const priceTableSelect = document.getElementById('priceTableSelect');
    const discountInput = document.getElementById('discountValue');
    const addDateBtn = document.getElementById('add-date-btn');
    const quoteCategoriesContainer = document.getElementById('quote-categories-container');
    const generalDataFields = ['clientName', 'clientCnpj', 'clientEmail', 'clientPhone', 'guestCount'];
    const saveBtn = document.getElementById('save-quote-btn');
    const loadBtn = document.getElementById('load-quote-btn');
    const printBtn = document.getElementById('print-btn');
    const detailsModal = document.getElementById('detailsModal');

    // --- INICIALIZAÇÃO ---
    async function initialize() {
        try {
            await loadDataFromSupabase();
            populatePriceTables();
            addEventListeners();
            render();
        } catch (error) {
            console.error("Falha crítica na inicialização:", error);
            alert("Não foi possível carregar os dados do banco de dados. Verifique sua conexão ou as configurações do Supabase e recarregue a página.");
        }
    }

    async function loadDataFromSupabase() {
        const { data: servicesData, error: servicesError } = await supabase.from('services').select('*');
        if (servicesError) throw servicesError;
        const { data: tablesData, error: tablesError } = await supabase.from('price_tables').select('*');
        if (tablesError) throw tablesError;

        appData.services = servicesData || [];
        appData.tabelas = (tablesData || []).reduce((acc, table) => {
            acc[table.name] = { modificador: table.modifier };
            return acc;
        }, {});
    }
    
    function populatePriceTables() {
        priceTableSelect.innerHTML = Object.keys(appData.tabelas).map(name => `<option value="${name}">${name}</option>`).join('');
        if (priceTableSelect.options.length > 0) {
            quote.general.priceTable = priceTableSelect.value;
        }
    }

    // --- LÓGICA DE RENDERIZAÇÃO ---
    function render() {
        renderGeneralData();
        renderDateManager();
        renderQuoteCategories();
        calculateTotal();
        setupMultiselects();
    }

    function renderGeneralData() {
        generalDataFields.forEach(fieldId => {
            document.getElementById(fieldId).value = quote.general[fieldId] || '';
        });
        priceTableSelect.value = quote.general.priceTable;
        discountInput.value = quote.general.discount;
    }
    
    function renderDateManager() {
        const container = document.getElementById('event-dates-container');
        container.innerHTML = '';
        quote.general.dates.forEach((dateObj, index) => {
            const div = document.createElement('div');
            div.className = 'date-entry';
            div.innerHTML = `
                <input type="date" value="${dateObj.date}" data-index="${index}" data-field="date" title="Data">
                <input type="time" value="${dateObj.startTime}" data-index="${index}" data-field="startTime" title="Horário de Início">
                <input type="time" value="${dateObj.endTime}" data-index="${index}" data-field="endTime" title="Horário de Término">
                <input type="text" placeholder="Observações da data..." value="${dateObj.observations || ''}" data-index="${index}" data-field="observations">
                <button class="btn-icon" data-action="removeDate" data-index="${index}">&times;</button>
            `;
            container.appendChild(div);
        });
    }

    function renderQuoteCategories() {
        quoteCategoriesContainer.innerHTML = '';
        const template = document.getElementById('category-template');
        const groupedItems = groupItemsByCategory();

        CATEGORY_ORDER.forEach(categoryName => {
            const clone = template.content.cloneNode(true);
            const categoryBlock = clone.querySelector('.category-block');
            categoryBlock.dataset.category = categoryName;

            clone.querySelector('.category-title').textContent = categoryName;
            
            const tableBody = clone.querySelector('tbody');
            renderTableForCategory(tableBody, categoryName, groupedItems[categoryName] || []);

            quoteCategoriesContainer.appendChild(clone);
        });
    }

    function renderTableForCategory(tableBody, category, items) {
        tableBody.innerHTML = '';
        const prices = getCalculatedPrices();
        let categorySubtotal = 0;
        
        items.forEach(item => {
            const itemIndex = quote.items.indexOf(item);
            const service = appData.services.find(s => s.id === item.id);
            const unitPrice = prices[item.id] || 0;
            const quantity = item.quantity || 1;
            const itemDiscount = item.discount_percent || 0;
            const totalBeforeDiscount = unitPrice * quantity;
            const discountAmount = totalBeforeDiscount * (itemDiscount / 100);
            const total = totalBeforeDiscount - discountAmount;
            categorySubtotal += total;

            const dateOptions = quote.general.dates.map((d, i) => `<option value="${d.date}" ${d.date === item.assignedDate ? 'selected' : ''}>Data ${i + 1} (${formatDateBR(d.date) || 'N/D'})</option>`).join('');

            const row = document.createElement('tr');
            row.dataset.index = itemIndex;
            row.innerHTML = `
                <td style="width:40%;">${service.name}</td>
                <td><select data-field="assignedDate"><option value="">Selecione</option>${dateOptions}</select></td>
                <td style="width: 80px;"><input type="number" value="${quantity}" min="1" data-field="quantity"></td>
                <td>R$ ${unitPrice.toFixed(2)}</td>
                <td>R$ ${total.toFixed(2)}</td>
                <td class="item-actions" style="width: 100px;">
                    <button class="btn-icon" data-action="toggleObs" data-index="${itemIndex}" title="Detalhes">💬</button>
                    <button class="btn-icon" data-action="duplicate" data-index="${itemIndex}" title="Duplicar">📋</button>
                    <button class="btn-icon" data-action="remove" data-index="${itemIndex}" title="Remover">&times;</button>
                </td>
            `;
            tableBody.appendChild(row);

            if (item.showObs) {
                const obsRow = document.createElement('tr');
                obsRow.className = 'observations-row';
                obsRow.innerHTML = `<td colspan="6">
                    <div class="form-grid" style="padding: 0.5rem 0; grid-template-columns: 2fr 1fr;">
                        <div class="form-group">
                            <label>Observações</label>
                            <textarea data-field="observacoes" rows="2">${item.observacoes || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Desconto do Item (%)</label>
                            <input type="number" min="0" max="100" value="${itemDiscount}" data-field="discount_percent">
                        </div>
                    </div>
                </td>`;
                tableBody.appendChild(obsRow);
            }
        });

        if (items.length > 0) {
            const subtotalRow = document.createElement('tr');
            subtotalRow.className = 'category-subtotal';
            subtotalRow.innerHTML = `<td colspan="4">Subtotal ${category}</td><td>R$ ${categorySubtotal.toFixed(2)}</td><td></td>`;
            tableBody.appendChild(subtotalRow);
        }
    }

    // --- LÓGICA DE CÁLCULO ---
    function calculateTotal() {
        const prices = getCalculatedPrices();
        let subtotal = 0;

        quote.items.forEach(item => {
            const service = appData.services.find(s => s.id === item.id);
            if (!service) return;
            const unitPrice = prices[item.id] || 0;
            const quantity = (item.quantity || 1);
            const itemDiscount = item.discount_percent || 0;
            const totalBeforeDiscount = unitPrice * quantity;
            const discountAmount = totalBeforeDiscount * (itemDiscount / 100);
            subtotal += totalBeforeDiscount - discountAmount;
        });
        
        const discount = parseFloat(discountInput.value) || 0;
        const total = subtotal - discount;

        document.getElementById('subtotalValue').textContent = `R$ ${subtotal.toFixed(2)}`;
        document.getElementById('totalValue').textContent = `R$ ${total.toFixed(2)}`;
    }

    // --- MANIPULADORES DE EVENTOS ---
    function addEventListeners() {
        addDateBtn.addEventListener('click', () => {
            quote.general.dates.push({ date: new Date().toISOString().split('T')[0], startTime: '19:00', endTime: '23:00', observations: '' });
            render();
        });
        
        generalDataFields.forEach(fieldId => {
            document.getElementById(fieldId).addEventListener('input', e => {
                quote.general[fieldId] = e.target.value;
            });
        });
        priceTableSelect.addEventListener('change', e => { quote.general.priceTable = e.target.value; render(); });
        discountInput.addEventListener('input', e => { quote.general.discount = parseFloat(e.target.value) || 0; calculateTotal(); });

        printBtn.addEventListener('click', generatePrintableQuote);
        saveBtn.addEventListener('click', saveQuote);
        loadBtn.addEventListener('click', loadQuote);
        
        document.body.addEventListener('change', e => {
            const { index, field } = e.target.dataset;
            if (index && field) {
                if (e.target.closest('.date-entry')) {
                    updateDate(index, field, e.target.value);
                } else if (e.target.closest('tr')) {
                    updateItem(index, field, e.target.value);
                }
            }
        });

        document.body.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;
            const { action, index } = button.dataset;
            if (action === 'removeDate') removeDate(index);
            if (action === 'toggleObs') toggleObs(index);
            if (action === 'duplicate') duplicateItem(index);
            if (action === 'remove') removeItem(index);
        });
    }
    
    // --- LÓGICA DO MENU MULTISELECT ---
    function setupMultiselects() {
        document.querySelectorAll('.multiselect-container').forEach(container => {
            const input = container.querySelector('.multiselect-input');
            const dropdown = container.querySelector('.multiselect-dropdown');
            const list = container.querySelector('.multiselect-list');
            const addButton = container.querySelector('.btn-add-selected');
            const category = container.closest('.category-block').dataset.category;

            list.innerHTML = '';
            appData.services.filter(s => s.category === category).forEach(service => {
                list.innerHTML += `<div class="multiselect-list-item"><label><input type="checkbox" value="${service.id}"> ${service.name}</label></div>`;
            });

            input.onclick = () => {
                const wasOpen = container.classList.contains('open');
                document.querySelectorAll('.multiselect-container.open').forEach(c => c.classList.remove('open'));
                if (!wasOpen) container.classList.add('open');
            };
            
            addButton.onclick = () => {
                const selected = list.querySelectorAll('input:checked');
                selected.forEach(checkbox => {
                    quote.items.push({ id: checkbox.value, quantity: 1, assignedDate: '', observacoes: '', discount_percent: 0 });
                    checkbox.checked = false;
                });
                container.classList.remove('open');
                render();
            };
        });

        document.addEventListener('click', e => {
            if (!e.target.closest('.multiselect-container')) {
                document.querySelectorAll('.multiselect-container.open').forEach(c => c.classList.remove('open'));
            }
        }, true);
    }
    
    // --- FUNÇÕES DE SALVAR/CARREGAR/IMPRIMIR ---
    function saveQuote() {
        localStorage.setItem('savedQuote', JSON.stringify(quote));
        alert('Cotação salva com sucesso no seu navegador!');
    }
    
    function loadQuote() {
        const savedData = localStorage.getItem('savedQuote');
        if (savedData) {
            if (confirm('Isso irá substituir a cotação atual. Deseja continuar?')) {
                quote = JSON.parse(savedData);
                render();
            }
        } else {
            alert('Nenhuma cotação salva foi encontrada.');
        }
    }

    function generatePrintableQuote() {
        const printArea = document.getElementById('print-output');
        const prices = getCalculatedPrices();
        const groupedItems = groupItemsByCategory();
        
        let html = `<div class="print-header"><h1>Proposta de Investimento</h1></div>`;
        html += `<div class="print-client-info">
                    <p><strong>Cliente:</strong> ${quote.general.clientName || 'Não informado'}</p>
                    <p><strong>CNPJ/CPF:</strong> ${quote.general.clientCnpj || 'Não informado'}</p>
                    <p><strong>Nº de Convidados:</strong> ${quote.general.guestCount}</p>
                 </div>`;
        
        CATEGORY_ORDER.forEach(category => {
            if (groupedItems[category] && groupedItems[category].length > 0) {
                html += `<h2 class="print-category-title">${category}</h2>`;
                html += `<table class="print-table"><thead><tr><th>Item</th><th>Data</th><th>Qtde</th><th>Vlr. Unit.</th><th>Subtotal</th></tr></thead><tbody>`;
                groupedItems[category].forEach(item => {
                    // Lógica de cálculo idêntica à da tela
                    const service = appData.services.find(s => s.id === item.id);
                    const unitPrice = prices[item.id] || 0;
                    const quantity = item.quantity || 1;
                    const itemDiscount = item.discount_percent || 0;
                    const totalBeforeDiscount = unitPrice * quantity;
                    const discountAmount = totalBeforeDiscount * (itemDiscount / 100);
                    const total = totalBeforeDiscount - discountAmount;
                    
                    html += `<tr>
                                <td>
                                    ${service.name}
                                    ${item.observacoes ? `<div class="print-item-obs">Obs: ${item.observacoes}</div>` : ''}
                                    ${itemDiscount > 0 ? `<div class="print-item-obs">Desconto: ${itemDiscount}%</div>` : ''}
                                </td>
                                <td>${formatDateBR(item.assignedDate) || '-'}</td>
                                <td>${quantity}</td>
                                <td class="price">R$ ${unitPrice.toFixed(2)}</td>
                                <td class="price">R$ ${total.toFixed(2)}</td>
                             </tr>`;
                });
                html += `</tbody></table>`;
            }
        });
        
        // Bloco de Totais
        const subtotal = parseFloat(document.getElementById('subtotalValue').textContent.replace('R$ ', '').replace('.', '').replace(',', '.'));
        const discount = parseFloat(discountInput.value) || 0;
        const total = parseFloat(document.getElementById('totalValue').textContent.replace('R$ ', '').replace('.', '').replace(',', '.'));
        
        html += `<div class="print-summary">
                    <table>
                        <tr><td class="total-label">Subtotal</td><td class="price total-value">R$ ${subtotal.toFixed(2)}</td></tr>
                        <tr><td class="total-label">Desconto Geral</td><td class="price total-value">- R$ ${discount.toFixed(2)}</td></tr>
                        <tr class="grand-total"><td class="total-label">VALOR TOTAL</td><td class="price total-value">R$ ${total.toFixed(2)}</td></tr>
                    </table>
                 </div>`;

        printArea.innerHTML = html;
        window.print();
    }
    
    // --- FUNÇÕES DE MANIPULAÇÃO DO ORÇAMENTO ---
    function updateItem(index, key, value) { const item = quote.items[parseInt(index)]; if(item) item[key] = (key === 'quantity' || key === 'discount_percent') ? parseFloat(value) || 0 : value; render(); }
    function removeItem(index) { quote.items.splice(parseInt(index), 1); render(); }
    function duplicateItem(index) { const item = quote.items[parseInt(index)]; if(item) quote.items.splice(parseInt(index) + 1, 0, JSON.parse(JSON.stringify(item))); render(); }
    function toggleObs(index) { const item = quote.items[parseInt(index)]; if(item) item.showObs = !item.showObs; render(); }
    function updateDate(index, field, value) { const date = quote.general.dates[parseInt(index)]; if (date) date[field] = value; render(); }
    function removeDate(index) { quote.general.dates.splice(parseInt(index), 1); render(); }
    
    // --- FUNÇÕES AUXILIARES ---
    function getCalculatedPrices() {
        const tableName = priceTableSelect.value;
        const table = appData.tabelas[tableName];
        if (!table) return {};
        const prices = {};
        appData.services.forEach(service => { prices[service.id] = (service.base_price || 0) * (table.modificador || 1); });
        return prices;
    }

    function groupItemsByCategory() {
        return quote.items.reduce((acc, item) => {
            const service = appData.services.find(s => s.id === item.id);
            if (service) (acc[service.category] = acc[service.category] || []).push(item);
            return acc;
        }, {});
    }

    function formatDateBR(dateString) { if (!dateString) return null; const [year, month, day] = dateString.split('-'); return `${day}/${month}/${year}`; }
    
    initialize();
});
