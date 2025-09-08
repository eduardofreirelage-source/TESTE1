import { supabase } from './supabase-client.js';

document.addEventListener('DOMContentLoaded', () => {
    // ESTADO DA APLICAÇÃO
    let appData = { services: [], tabelas: {} };
    let quote = {
        id: null,
        general: { clientName: '', clientCnpj: '', clientEmail: '', clientPhone: '', guestCount: 100, priceTable: '', discount: 0, dates: [] },
        items: []
    };
    const CATEGORY_ORDER = ['Espaço', 'Gastronomia', 'Equipamentos', 'Serviços / Outros'];
    let isDirty = false;

    // --- ELEMENTOS DO DOM ---
    const priceTableSelect = document.getElementById('priceTableSelect');
    const discountInput = document.getElementById('discountValue');
    const addDateBtn = document.getElementById('add-date-btn');
    const quoteCategoriesContainer = document.getElementById('quote-categories-container');
    const generalDataFields = ['clientName', 'clientCnpj', 'clientEmail', 'clientPhone', 'guestCount'];
    const saveBtn = document.getElementById('save-quote-btn');
    const printBtn = document.getElementById('print-btn');
    const notification = document.getElementById('save-notification');
    const clientCnpjInput = document.getElementById('clientCnpj');

    // --- INICIALIZAÇÃO ---
    async function initialize() {
        try {
            await loadDataFromSupabase();
            populatePriceTables();
            addEventListeners();
            await loadQuoteFromURL();
            render();
        } catch (error) {
            console.error("Falha crítica na inicialização:", error);
            alert("Não foi possível carregar os dados. Verifique o console para mais detalhes.");
        }
    }

    async function loadDataFromSupabase() {
        const { data: servicesData, error: servicesError } = await supabase.from('services').select('*');
        if (servicesError) throw servicesError;
        const { data: tablesData, error: tablesError } = await supabase.from('price_tables').select('*');
        if (tablesError) throw tablesError;
        const { data: pricesData, error: pricesError } = await supabase.from('service_prices').select('*');
        if (pricesError) throw pricesError;

        appData.services = servicesData || [];
        appData.tabelas = (tablesData || []).reduce((acc, table) => {
            acc[table.id] = { name: table.name };
            return acc;
        }, {});
        appData.prices = (pricesData || []).reduce((acc, p) => {
            if (!acc[p.price_table_id]) acc[p.price_table_id] = {};
            acc[p.price_table_id][p.service_id] = p.price;
            return acc;
        }, {});
    }
    
    function populatePriceTables() {
        priceTableSelect.innerHTML = Object.entries(appData.tabelas)
            .map(([id, table]) => `<option value="${id}">${table.name}</option>`)
            .join('');
        if (priceTableSelect.options.length > 0 && !quote.general.priceTable) {
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
        setDirty(isDirty);
    }

    function renderGeneralData() {
        generalDataFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if(element) element.value = quote.general[fieldId] || '';
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
            if(!template) return;
            const clone = template.content.cloneNode(true);
            const accordion = clone.querySelector('.category-accordion');
            accordion.dataset.category = categoryName;

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
            const total = (unitPrice * quantity) * (1 - itemDiscount / 100);
            categorySubtotal += total;

            const dateOptions = quote.general.dates.map((d, i) => `<option value="${d.date}" ${d.date === item.assignedDate ? 'selected' : ''}>Data ${i + 1} (${formatDateBR(d.date) || 'N/D'})</option>`).join('');

            const row = document.createElement('tr');
            row.dataset.index = itemIndex;
            row.innerHTML = `
                <td>${service.name}</td>
                <td><select data-field="assignedDate"><option value="">Selecione</option>${dateOptions}</select></td>
                <td><input type="number" value="${quantity}" min="1" data-field="quantity"></td>
                <td>R$ ${unitPrice.toFixed(2)}</td>
                <td><input type="number" value="${itemDiscount}" min="0" max="100" data-field="discount_percent"></td>
                <td>R$ ${total.toFixed(2)}</td>
                <td class="item-actions">
                    <button class="btn-icon" data-action="showObs" data-index="${itemIndex}" title="Observações">💬</button>
                    <button class="btn-icon" data-action="duplicate" data-index="${itemIndex}" title="Duplicar">📋</button>
                    <button class="btn-icon" data-action="remove" data-index="${itemIndex}" title="Remover">&times;</button>
                </td>
            `;
            tableBody.appendChild(row);
        });

        if (items.length > 0) {
            const subtotalRow = document.createElement('tr');
            subtotalRow.className = 'category-subtotal';
            subtotalRow.innerHTML = `<td colspan="5">Subtotal ${category}</td><td>R$ ${categorySubtotal.toFixed(2)}</td><td></td>`;
            tableBody.appendChild(subtotalRow);
        }
    }

    function calculateTotal() {
        const prices = getCalculatedPrices();
        let subtotal = 0;
        quote.items.forEach(item => {
            const service = appData.services.find(s => s.id === item.id);
            if (!service) return;
            const unitPrice = prices[item.id] || 0;
            const quantity = (item.quantity || 1);
            const itemDiscount = item.discount_percent || 0;
            subtotal += (unitPrice * quantity) * (1 - itemDiscount / 100);
        });
        const discount = parseFloat(discountInput.value) || 0;
        const total = subtotal - discount;
        document.getElementById('subtotalValue').textContent = `R$ ${subtotal.toFixed(2)}`;
        document.getElementById('totalValue').textContent = `R$ ${total.toFixed(2)}`;
    }

    function addEventListeners() {
        addDateBtn.addEventListener('click', () => {
            quote.general.dates.push({ date: new Date().toISOString().split('T')[0], startTime: '19:00', endTime: '23:00', observations: '' });
            setDirty(true);
            render();
        });
        
        generalDataFields.forEach(id => document.getElementById(id)?.addEventListener('input', e => { quote.general[id] = e.target.value; setDirty(true); }));
        priceTableSelect.addEventListener('change', e => { quote.general.priceTable = e.target.value; setDirty(true); render(); });
        discountInput.addEventListener('input', e => { quote.general.discount = parseFloat(e.target.value) || 0; setDirty(true); calculateTotal(); });

        if (printBtn) printBtn.addEventListener('click', generatePrintableQuote);
        if (saveBtn) saveBtn.addEventListener('click', saveQuoteToSupabase);
        
        document.body.addEventListener('change', e => {
            const { index, field } = e.target.dataset;
            if (index && field) {
                if (e.target.closest('.date-entry')) updateDate(index, field, e.target.value);
                else if (e.target.closest('tr')) updateItem(index, field, e.target.value);
            }
        });
        document.body.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) { closeAllPopups(); return; }
            const { action, index } = button.dataset;
            if (action === 'removeDate') removeDate(index);
            if (action === 'duplicate') duplicateItem(index);
            if (action === 'remove') removeItem(index);
            if (action === 'showObs') { e.stopPropagation(); openObsPopover(index, button); }
        });
    }
    
    function setupMultiselects() {
        document.querySelectorAll('.multiselect-container').forEach(container => {
            const input = container.querySelector('.multiselect-input');
            const list = container.querySelector('.multiselect-list');
            const addButton = container.querySelector('.btn-add-selected');
            const category = container.closest('.category-accordion').dataset.category;

            list.innerHTML = '';
            appData.services.filter(s => s.category === category).forEach(service => {
                list.innerHTML += `<div class="multiselect-list-item"><label><input type="checkbox" value="${service.id}"> ${service.name}</label></div>`;
            });

            input.onclick = (e) => {
                e.stopPropagation();
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
                setDirty(true);
                render();
            };
        });
        document.addEventListener('click', e => {
            if (!e.target.closest('.multiselect-container')) {
                document.querySelectorAll('.multiselect-container.open').forEach(c => c.classList.remove('open'));
            }
        });
    }
    
    async function saveQuoteToSupabase() { /* ... */ }
    async function loadQuoteFromURL() { /* ... */ }
    function generatePrintableQuote() { /* ... */ }
    
    function updateItem(index, key, value) { const item = quote.items[parseInt(index)]; if(item) { item[key] = (key === 'quantity' || key === 'discount_percent') ? parseFloat(value) || 0 : value; setDirty(true); render(); } }
    function removeItem(index) { quote.items.splice(parseInt(index), 1); setDirty(true); render(); }
    function duplicateItem(index) { const item = quote.items[parseInt(index)]; if(item) { quote.items.splice(parseInt(index) + 1, 0, JSON.parse(JSON.stringify(item))); setDirty(true); render(); } }
    function updateDate(index, field, value) { const date = quote.general.dates[parseInt(index)]; if (date) { date[field] = value; setDirty(true); render(); } }
    function removeDate(index) { quote.general.dates.splice(parseInt(index), 1); setDirty(true); render(); }
    
    function getCalculatedPrices() {
        const tableId = priceTableSelect.value;
        const prices = {};
        appData.services.forEach(service => { prices[service.id] = appData.prices[tableId]?.[service.id] || 0; });
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
    function showNotification(message, isError = false) { /* ... */ }
    function setDirty(state) { /* ... */ }
    function handleCnpjMask(e) { /* ... */ }
    function openObsPopover(index, button) { /* ... */ }
    function closeAllPopups() { /* ... */ }
    
    initialize();
});
