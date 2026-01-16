
import { getKpCompanyConfig } from "../config.js";
import { formatMoney } from "./kpCalc.js";

/**
 * Generates the full HTML string for the KP.
 * Embeds the model as base64 JSON.
 */
export function renderKpHtml(model) {
    const company = getKpCompanyConfig();

    // 1. Prepare Embedded Data
    const jsonStr = JSON.stringify(model);
    // Simple base64 encoding with utf8 support hack
    const base64Data = btoa(unescape(encodeURIComponent(jsonStr)));

    // 2. Dates
    const createdDate = new Date(model.meta.createdAt);
    const validUntil = new Date(createdDate.getTime() + (model.meta.validDays * 24 * 60 * 60 * 1000));

    // 3. Render Sections
    const renderTable = (title, items, total) => {
        if (!items || !items.length) return "";
        return `
            <div class="section">
                <h2>${title}</h2>
                <table>
                    <tr>
                        <th>Наименование</th>
                        <th width="80">Кол-во</th>
                        <th width="120">Цена</th>
                        <th width="120">Сумма</th>
                    </tr>
                    ${items.map(i => `
                    <tr>
                        <td>${i.name}</td>
                        <td class="center">${i.qty}</td>
                        <td class="right">${formatMoney(i.price)}</td>
                        <td class="right">${formatMoney(i.total)}</td>
                    </tr>
                    `).join("")}
                </table>
                <div class="section-total">Итого раздел: ${formatMoney(total)}</div>
            </div>
        `;
    };

    const maint = model.sections.maintenance;
    const maintTotal = maint.total;
    const maintBlock = maintTotal > 0 ? `
        <div class="section">
            <h2>Техническое обслуживание (iiko)</h2>
            <p>
                Количество терминалов: <b>${maint.terminals}</b><br>
                Стоимость за терминал: <b>${formatMoney(maint.price)}</b>
            </p>
            <div class="section-total">Итого раздел: ${formatMoney(maintTotal)}</div>
        </div>
    ` : "";

    // 4. Expiration Logic Script
    // We inject a small script to check date and show banner
    const expirationScript = `
        <script>
            (function() {
                try {
                    var dataEl = document.getElementById("kp-data-b64");
                    if(dataEl) {
                        var json = decodeURIComponent(escape(atob(dataEl.textContent)));
                        var model = JSON.parse(json);
                        
                        var created = new Date(model.meta.createdAt);
                        var validDays = model.meta.validDays;
                        var expires = created.getTime() + (validDays * 24 * 60 * 60 * 1000);
                        var now = Date.now();
                        
                        if (now > expires) {
                            document.body.classList.add("expired");
                            document.getElementById("expired-banner").style.display = "flex";
                        }
                    }
                } catch(e) { console.warn("KP Validation failed", e); }
            })();
        </script>
    `;

    // 5. Full Template
    // Using inline CSS for portability
    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>КП от ${company.name}</title>
    <style>
        body { font-family: sans-serif; margin: 0; padding: 0; color: #333; line-height: 1.5; }
        .container { max-width: 800px; margin: 0 auto; padding: 40px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        .company-info { font-size: 0.9em; color: #555; }
        h1 { margin: 0 0 10px 0; color: #2c3e50; }
        h2 { margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; font-size: 1.2em; color: #444; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #eee; padding: 8px 12px; text-align: left; }
        th { background: #f9f9f9; font-weight: bold; }
        .right { text-align: right; }
        .center { text-align: center; }
        .section-total { text-align: right; margin-top: 10px; font-weight: bold; }
        .grand-total { font-size: 1.5em; text-align: right; margin-top: 40px; background: #f0f8ff; padding: 20px; border-radius: 8px; }
        .manager-block { margin-top: 50px; display: flex; gap: 20px; align-items: center; border-top: 1px solid #eee; padding-top: 20px; }
        .manager-avatar { width: 60px; height: 60px; border-radius: 50%; background: #ccc; overflow: hidden; }
        .manager-avatar img { width: 100%; height: 100%; object-fit: cover; }
        
        /* Expired State */
        body.expired .container { filter: blur(5px); pointer-events: none; user-select: none; }
        #expired-banner { 
            position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
            background: rgba(0,0,0,0.85); 
            z-index: 9999; 
            display: none; /* Toggled by script */
            color: white; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            text-align: center;
        }
        #expired-banner h1 { color: #ff6b6b; }
        .contact-card { background: #333; padding: 20px; border-radius: 8px; margin-top: 20px; }
    </style>
</head>
<body>

    <div id="expired-banner">
        <h1>Срок действия предложения истёк</h1>
        <p>К сожалению, условия данного КП больше не актуальны.</p>
        <div class="contact-card">
            <h3>Свяжитесь для обновления условий:</h3>
            <p>${model.meta.manager.name} (${model.meta.manager.post})</p>
            <p>📞 ${model.meta.manager.phone || company.phone}</p>
        </div>
    </div>

    <div class="container">
        <div class="header">
            <div>
                <h1>Коммерческое предложение</h1>
                <div>Дата: <b>${createdDate.toLocaleDateString()}</b></div>
                <div>Действительно до: <b>${validUntil.toLocaleDateString()}</b></div>
            </div>
            <div class="company-info" style="text-align: right;">
                <b>${company.name}</b><br>
                ${company.address || ""}<br>
                ${company.phone}<br>
                ${company.email}
            </div>
        </div>

        <div class="intro">
            Уважаемый клиент! <br>
            Предлагаем вам рассмотреть следующее предложение по автоматизации.
        </div>

        ${renderTable("Услуги", model.sections.services.items, model.sections.services.total)}
        ${renderTable("Лицензии", model.sections.licenses.items, model.sections.licenses.total)}
        ${renderTable("Оборудование", model.sections.equipment.items, model.sections.equipment.total)}
        ${maintBlock}

        <div class="grand-total">
            Итого к оплате: <b>${formatMoney(model.total)}</b>
        </div>

        <div class="manager-block">
            <div class="manager-avatar">
                ${model.meta.manager.avatar ? `<img src="${model.meta.manager.avatar}" alt="Manager">` : ""}
            </div>
            <div>
                <div><b>Ваш менеджер:</b> ${model.meta.manager.name}</div>
                <div>${model.meta.manager.post}</div>
                <div>${model.meta.manager.phone || ""}</div>
            </div>
        </div>
    </div>

    <!-- Embedded Data for Restoration -->
    <script id="kp-data-b64" type="application/json">${base64Data}</script>
    ${expirationScript}
</body>
</html>`;
}

/**
 * Extracts model from HTML string.
 */
export function parseKpHtml(htmlString) {
    // 1. Find script tag
    // Regex is risky for HTML, but strict format allows it here
    const match = htmlString.match(/<script id="kp-data-b64" type="application\/json">([^<]+)<\/script>/);
    if (!match || !match[1]) {
        throw new Error("KP Data not found in HTML file");
    }

    try {
        const json = decodeURIComponent(escape(atob(match[1])));
        return JSON.parse(json);
    } catch (e) {
        throw new Error("Failed to decode KP data: " + e.message);
    }
}
