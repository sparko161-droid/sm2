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
  const base64Data = btoa(unescape(encodeURIComponent(jsonStr)));

  // 2. Dates
  const createdDate = new Date(model.meta.createdAt);
  const validUntil = new Date(
    createdDate.getTime() + model.meta.validDays * 24 * 60 * 60 * 1000,
  );

  const renderServicesTable = (items, section) => {
    if (!items || !items.length) return "";
    const subtotal = section.subtotal || items.reduce((s, i) => s + (i.subtotal || i.qty * i.price), 0);
    const total = section.total || items.reduce((s, i) => s + (i.total || i.qty * i.price), 0);
    const hasDiscounts = items.some(i => (i.discountPercent || 0) > 0);
    
    return `
      <div class="section">
        <h2>Услуги</h2>
        <table>
          <tr>
            <th>Наименование</th>
            <th>Описание</th>
            <th width="60">Кол-во</th>
            <th width="100">Цена</th>
            ${hasDiscounts ? '<th width="70">Скидка</th>' : ''}
            <th width="100">Сумма</th>
          </tr>
          ${items.map(i => `
          <tr>
            <td style="font-weight: 600;">${i.name || ""}</td>
            <td class="description">${i.description || ""}</td>
            <td class="center">${i.qty}</td>
            <td class="right">${formatMoney(i.price)}</td>
            ${hasDiscounts ? `<td class="center" style="color: var(--brand-red); font-weight: 700;">${i.discountPercent || 0}%</td>` : ''}
            <td class="right" style="font-weight: 700;">${formatMoney(i.total || i.qty * i.price)}</td>
          </tr>
          `).join("")}
        </table>
        ${hasDiscounts ? `
          <div class="section-totals">
            <div>Итого без скидки: ${formatMoney(subtotal)}</div>
            <div class="total-with-discount">Итого со скидкой: <b>${formatMoney(total)}</b></div>
          </div>
        ` : `
          <div class="section-total">Итого раздел: ${formatMoney(total)}</div>
        `}
      </div>
    `;
  };

  const renderEquipmentTable = (items, section) => {
    if (!items || !items.length) return "";
    const total = section.total || items.reduce((s, i) => s + (i.total || i.qty * i.price), 0);
    const hasDiscounts = items.some(i => (i.discountPercent || 0) > 0);
    const subtotal = section.subtotal || items.reduce((s, i) => s + (i.qty * i.price), 0);
    
    return `
      <div class="section">
        <h2>Оборудование</h2>
        <table class="equipment-table">
          <tr>
            <th width="72">Фото</th>
            <th>Наименование</th>
            <th width="120">Тип</th>
            <th width="60">Кол-во</th>
            <th width="100">Цена</th>
            ${hasDiscounts ? '<th width="70">Скидка</th>' : ''}
            <th width="100">Сумма</th>
          </tr>
          ${items.map(i => {
            const photoSrc = i.photo?.base64Data 
              ? `data:image/jpeg;base64,${i.photo.base64Data}` 
              : null;
            const photoHtml = photoSrc 
              ? `<img src="${photoSrc}" alt="${i.name}" class="eq-photo">` 
              : `<div class="eq-photo-placeholder"></div>`;
            
            return `
          <tr>
            <td class="photo-cell">${photoHtml}</td>
            <td>
              <div class="eq-name">${i.name || ""}</div>
              ${i.description ? `<div class="eq-desc">${i.description}</div>` : ""}
            </td>
            <td>${i.typeName || ""}</td>
            <td class="center">${i.qty}</td>
            <td class="right">${formatMoney(i.price)}</td>
            ${hasDiscounts ? `<td class="center" style="color: var(--brand-red); font-weight: 700;">${i.discountPercent || 0}%</td>` : ''}
            <td class="right" style="font-weight: 700;">${formatMoney(i.total || i.qty * i.price)}</td>
          </tr>
            `;
          }).join("")}
        </table>
        ${hasDiscounts ? `
          <div class="section-totals">
            <div>Итого без скидки: ${formatMoney(subtotal)}</div>
            <div class="total-with-discount">Итого со скидкой: <b>${formatMoney(total)}</b></div>
          </div>
        ` : `
          <div class="section-total">Итого раздел: ${formatMoney(total)}</div>
        `}
      </div>
    `;
  };

  // 5. Render Licenses Table (simple)
  const renderLicensesTable = (items, section) => {
    if (!items || !items.length) return "";
    const total = section.total || items.reduce((s, i) => s + (i.total || i.qty * i.price), 0);
    const subtotal = section.subtotal || items.reduce((s, i) => s + (i.qty * i.price), 0);
    const hasDiscounts = items.some(i => (i.discountPercent || 0) > 0);
    
    return `
      <div class="section">
        <h2>Лицензии</h2>
        <table>
          <tr>
            <th>Наименование</th>
            <th>Описание</th>
            <th width="60">Кол-во</th>
            <th width="80">Цена</th>
            ${hasDiscounts ? '<th width="70">Скидка</th>' : ''}
            <th width="100">Сумма</th>
          </tr>
          ${items.map(i => `
          <tr>
            <td style="font-weight: 600;">${i.name || ""}</td>
            <td class="description">${i.description || ""}</td>
            <td class="center">${i.qty}</td>
            <td class="right">${formatMoney(i.price)}</td>
            ${hasDiscounts ? `<td class="center" style="color: var(--brand-red); font-weight: 700;">${i.discountPercent || 0}%</td>` : ''}
            <td class="right" style="font-weight: 700;">${formatMoney(i.total || i.qty * i.price)}</td>
          </tr>
          `).join("")}
        </table>
        ${hasDiscounts ? `
          <div class="section-totals">
            <div>Итого без скидки: ${formatMoney(subtotal)}</div>
            <div class="total-with-discount">Итого со скидкой: <b>${formatMoney(total)}</b></div>
          </div>
        ` : `
          <div class="section-total">Итого раздел: ${formatMoney(total)}</div>
        `}
      </div>
    `;
  };

  const renderTrainingsTable = (items, section) => {
    if (!items || !items.length) return "";
    const total = section.total || items.reduce((s, i) => s + (i.total || i.qty * i.price), 0);
    const subtotal = section.subtotal || items.reduce((s, i) => s + (i.qty * i.price), 0);
    const hasDiscounts = items.some(i => (i.discountPercent || 0) > 0);
    
    return `
      <div class="section">
        <h2>Обучение</h2>
        <table>
          <tr>
            <th>Наименование</th>
            <th width="60">Кол-во</th>
            <th width="100">Цена</th>
            ${hasDiscounts ? '<th width="70">Скидка</th>' : ''}
            <th width="100">Сумма</th>
          </tr>
          ${items.map(i => `
          <tr>
            <td style="font-weight: 600;">${i.name || ""}</td>
            <td class="center">${i.qty}</td>
            <td class="right">${formatMoney(i.price)}</td>
            ${hasDiscounts ? `<td class="center" style="color: var(--brand-red); font-weight: 700;">${i.discountPercent || 0}%</td>` : ''}
            <td class="right" style="font-weight: 700;">${formatMoney(i.total || i.qty * i.price)}</td>
          </tr>
          `).join("")}
        </table>
        ${hasDiscounts ? `
          <div class="section-totals">
            <div>Итого без скидки: ${formatMoney(subtotal)}</div>
            <div class="total-with-discount">Итого со скидкой: <b>${formatMoney(total)}</b></div>
          </div>
        ` : `
          <div class="section-total">Итого раздел: ${formatMoney(total)}</div>
        `}
      </div>
    `;
  };

  const maint = model.sections.maintenance;
  const maintTotal = maint.total;
  const maintHasDiscount = (maint.discountPercent || 0) > 0;

  const maintBlock = maintTotal > 0 ? `
    <div class="section">
      <h2>Техническое обслуживание (iiko)</h2>
      <table>
        <tr>
          <th>Наименование</th>
          <th class="center" width="60">Терм.</th>
          ${maintHasDiscount ? `
            <th class="right" width="100">База</th>
            <th class="center" width="80">Скидка</th>
            <th class="right" width="110">Сумма без ск.</th>
          ` : `
            <th class="right" width="100">Цена</th>
          `}
          <th class="right" width="110">Итого</th>
        </tr>
        <tr>
          <td style="font-weight: 600;">Техническое обслуживание и поддержка систем</td>
          <td class="center">${maint.terminals}</td>
          ${maintHasDiscount ? `
            <td class="right">${formatMoney(maint.basePrice)}</td>
            <td class="center" style="color: var(--brand-red); font-weight: 700;">${maint.discountPercent}%</td>
            <td class="right">${formatMoney(maint.subtotal)}</td>
          ` : `
            <td class="right">${formatMoney(maint.unitPrice)}</td>
          `}
          <td class="right" style="font-weight: 800;">${formatMoney(maintTotal)}</td>
        </tr>
      </table>
      <div class="section-total">Итого за ${maint.months} мес: ${formatMoney(maintTotal)}</div>
      <div style="text-align: right; margin-top: 5px; font-size: 0.9em; color: var(--text-muted);">
        Далее стоимость: 
        <span style="color: var(--brand-red); font-weight: 700;">${formatMoney(maint.unitPrice * (maint.terminals || 1))}/мес</span>
        ${maintHasDiscount ? `<span style="text-decoration: line-through; margin-left: 5px;">${formatMoney(maint.basePrice * (maint.terminals || 1))}/мес</span>` : ''}
      </div>
    </div>
  ` : "";

  const manager = model.meta.manager;
  const tgHandle = (manager.tg || "").replace(/^@/, "");
  const tgLink = tgHandle ? `https://t.me/${tgHandle}` : "";
  const phoneTel = (manager.phone || "").replace(/[^\d+]/g, "");

  // Helper to format phone as +7 (XXX) XXX XX-XX
  const formatPhone = (p) => {
    const d = p.replace(/\D/g, "");
    if (d.length === 11) {
      return `+${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)} ${d.slice(7,9)}-${d.slice(9,11)}`;
    }
    return p;
  };
  const phoneDisplay = formatPhone(manager.phone || "");

  // 6. Expiration Logic Script
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

  // 7. Full Template with improved styling
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>КП от ${company.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --brand-red: #d20000;
      --brand-black: #000000;
      --brand-white: #ffffff;
      --brand-gray: #f5f5f5;
      --brand-border: #eeeeee;
      --brand-gradient: linear-gradient(135deg, #ff7d00 0%, #d20000 100%);
      --text-main: #1a1a1a;
      --text-muted: #666666;
      --radius: 20px;
    }

    * { box-sizing: border-box; }
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      margin: 0; padding: 0; 
      color: var(--text-main); 
      line-height: 1.5; 
      background: var(--brand-gray); 
    }
    
    .container { 
      max-width: 900px; 
      margin: 100px auto 60px auto; 
      padding: 40px; 
      background: white; 
      min-height: 100vh; 
      position: relative;
      border-radius: var(--radius);
      box-shadow: 0 10px 40px rgba(0,0,0,0.05);
    }
    
    /* Header (Sticky) */
    .sticky-header { 
      position: fixed; top: 0; left: 0; right: 0; 
      background: rgba(255, 255, 255, 0.95); 
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--brand-border); 
      z-index: 1000; box-shadow: 0 2px 15px rgba(0,0,0,0.05); 
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 40px;
    }
    .sticky-header .brand-area { display: flex; align-items: center; gap: 15px; }
    .sticky-header .logo-img { height: 32px; width: auto; }
    
    .manager-header-info { display: flex; align-items: center; gap: 15px; flex: 1; justify-content: flex-end; margin-right: 30px; }
    .manager-header-info .manager-details { text-align: right; }
    .manager-header-info .manager-name { font-weight: 800; font-size: 0.9em; line-height: 1; }
    .manager-header-info .manager-post { font-size: 0.7em; color: var(--brand-red); font-weight: 600; }
    .manager-header-info .manager-avatar-img { width: 36px; height: 36px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.1); object-fit: cover; }

    .sticky-header .manager-fast-contact { display: flex; align-items: center; gap: 20px; font-size: 0.85em; }
    .sticky-header .manager-fast-contact a { text-decoration: none; color: var(--text-main); font-weight: 600; display: flex; align-items: center; gap: 5px; }
    .sticky-header .manager-fast-contact a:hover { color: var(--brand-red); opacity: 0.8; }
    
    .main-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--brand-border); }
    .header-left h1 { margin: 0 0 12px 0; color: var(--brand-black); font-size: clamp(12px, 5vw, 2.2em); font-weight: 800; letter-spacing: -0.02em; width: max-content; max-width: 100%; }
    .header-left .meta { color: var(--text-muted); font-size: 0.9em; display: flex; flex-direction: column; gap: 4px; }
    .header-left .meta b { color: var(--brand-red); }
    
    .company-info { text-align: right; font-size: 0.85em; color: var(--text-muted); }
    .company-logo-main { height: 45px; margin-bottom: 10px; }
    
    .tg-contact-link { display: flex; align-items: center; gap: 8px; text-decoration: none; color: inherit; }
    .tg-header-icon { width: 32px; height: 32px; object-fit: contain; }
    
    .desktop-only { display: inline; }
    
    /* Sections */
    .section { 
      margin: 40px 0; 
      background: #fdfdfd; 
      border-radius: var(--radius); 
      padding: 30px; 
      border: 2px solid #ebebeb; 
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
      position: relative;
    }
    .section:hover { 
      border-color: var(--brand-red); 
      background: #ffffff;
      transform: translateY(-5px);
      box-shadow: 0 15px 35px rgba(0,0,0,0.08);
    }
    h2 { 
      margin: 0 0 25px 0; 
      color: var(--brand-black); 
      font-size: 1.5em; 
      font-weight: 800; 
      display: flex; 
      align-items: center; 
      gap: 12px; 
    }
    h2::before { 
      content: ""; 
      display: block; 
      width: 5px; 
      height: 1.2em; 
      background: var(--brand-red); 
      border-radius: 4px; 
    }
    
    /* Tables */
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 10px; font-size: 0.95em; }
    th { 
      background: transparent; 
      color: var(--text-muted); 
      font-weight: 700; 
      text-transform: uppercase; 
      font-size: 0.75em; 
      letter-spacing: 0.08em; 
      padding: 15px 12px; 
      border-bottom: 3px solid var(--brand-black); 
      text-align: left; 
    }
    td { padding: 18px 12px; border-bottom: 1px solid var(--brand-border); vertical-align: top; }
    
    .right { text-align: right; }
    .center { text-align: center; }
    .description { color: var(--text-muted); font-size: 0.85em; line-height: 1.5; }
    
    /* Section totals */
    .section-total { text-align: right; margin-top: 25px; font-weight: 800; font-size: 1.15em; color: var(--brand-red); }
    .section-totals { text-align: right; margin-top: 25px; border-top: 2px dashed #eee; padding-top: 20px; }
    .section-totals div { margin: 10px 0; font-size: 0.95em; color: var(--text-muted); }
    .total-with-discount { font-size: 1.3em; color: var(--brand-black); font-weight: 800; }
    .total-with-discount b { color: var(--brand-red); }
    
    /* Equipment specific */
    .equipment-table .photo-cell { padding: 10px; text-align: center; width: 90px; }
    .eq-photo { width: 70px; height: 70px; object-fit: cover; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); border: 2px solid white; }
    .eq-photo-placeholder { width: 70px; height: 70px; background: #eee; border-radius: 12px; display: inline-block; }
    .eq-name { font-weight: 800; color: var(--brand-black); margin-bottom: 6px; font-size: 1.05em; }
    .eq-desc { font-size: 0.85em; color: var(--text-muted); margin-top: 4px; line-height: 1.4; }
    
    /* Grand total */
    .grand-total { 
      font-size: 1.6em; 
      text-align: right; 
      margin-top: 50px; 
      background: var(--brand-gradient); 
      color: white; 
      padding: 35px; 
      border-radius: var(--radius); 
      box-shadow: 0 10px 30px rgba(210,0,0,0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .grand-total .label { font-size: 0.6em; text-transform: uppercase; font-weight: 600; opacity: 0.9; text-align: left; line-height: 1.2; }
    .grand-total b { font-weight: 900; }
    
    /* Manager block */
    .manager-block { 
      margin-top: 0; 
      margin-bottom: 40px;
      display: flex; 
      gap: 25px; 
      align-items: center; 
      background: white; 
      padding: 30px; 
      border-radius: var(--radius); 
      border: 1px solid var(--brand-border); 
      box-shadow: 0 4px 15px rgba(0,0,0,0.03);
    }
    .manager-avatar { width: 85px; height: 85px; border-radius: 50%; background: #fff; overflow: hidden; flex-shrink: 0; box-shadow: 0 5px 15px rgba(0,0,0,0.1); border: 3px solid white; }
    .manager-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .manager-info { line-height: 1.6; }
    .manager-name { font-weight: 800; font-size: 1.25em; color: var(--brand-black); margin-bottom: 2px; }
    .manager-post { font-size: 0.9em; color: var(--brand-red); font-weight: 600; margin-bottom: 12px; }
    .manager-links { display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.85em; }
    .manager-links a { color: var(--text-main); text-decoration: none; font-weight: 600; display: flex; align-items: center; gap: 5px; }
    .manager-links a:hover { color: var(--brand-red); }
    
    /* Client Info */
    .client-card { 
      min-width: 280px; 
      background: var(--brand-gray); 
      padding: 25px; 
      border-radius: var(--radius); 
      border: 1px solid var(--brand-border); 
      font-size: 0.9em; 
    }
    .client-card h4 { margin: 0 0 12px 0; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
    .client-card .jur-name { font-weight: 800; color: var(--brand-black); font-size: 1.1em; margin-bottom: 5px; }
    .client-card .inn-label { color: var(--brand-red); font-weight: 700; margin-top: 8px; }

    /* Expired State */
    body.expired .container, body.expired .sticky-header { filter: blur(10px); pointer-events: none; user-select: none; }
    #expired-banner { 
      position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
      background: rgba(0,0,0,0.92); 
      z-index: 9999; 
      display: none;
      color: white; 
      flex-direction: column; 
      align-items: center; 
      justify-content: center; 
      text-align: center;
      padding: 30px;
    }
    #expired-banner h1 { color: var(--brand-red); margin-bottom: 15px; font-size: 2.5em; font-weight: 900; }
    .contact-card-exp { background: rgba(255,255,255,0.1); padding: 30px; border-radius: var(--radius); margin-top: 30px; max-width: 450px; backdrop-filter: blur(5px); }
    .contact-card-exp h3 { margin: 0 0 20px 0; color: white; font-weight: 800; font-size: 1.2em; }
    .contact-card-exp a { color: white; text-decoration: none; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.3); }
    
    @media (max-width: 800px) {
      .sticky-header { padding: 8px 12px; justify-content: space-between; gap: 8px; }
      .sticky-header .manager-header-info { display: flex; margin-right: 0; gap: 8px; }
      .sticky-header .manager-header-info .manager-details { display: none; }
      .sticky-header .manager-header-info .manager-avatar-img { width: 28px; height: 28px; }
      .sticky-header .manager-fast-contact { display: flex; gap: 10px; font-size: 0.8em; }
      .sticky-header .manager-fast-contact a { gap: 3px; white-space: nowrap; }

      .container { 
        padding: 15px; 
        margin-top: 55px; 
        margin-bottom: 0; 
        border-radius: 0; 
        max-width: 100%; 
        box-shadow: none;
      }
      .main-header { flex-direction: column; gap: 15px; align-items: center; text-align: center; }
      .header-left { width: 100%; display: flex; flex-direction: column; align-items: center; }
      .header-left h1 { font-size: 1.6em; text-align: center; width: auto; margin-bottom: 8px; }
      .header-left .meta { align-items: center; font-size: 0.85em; }
      
      .company-info { text-align: center; width: 100%; font-size: 0.8em; }
      .company-logo-main { height: 35px; }

      .client-layout { flex-direction: column; gap: 15px !important; text-align: center; }
      .client-card { width: 100%; padding: 20px; }
      .intro { font-size: 1em !important; }

      /* Mobile layout for tables: Restore horizontal scroll */
      .section { overflow-x: auto; padding: 15px 10px; margin: 25px 0; }
      .section h2 { font-size: 1.3em; margin-bottom: 15px; }
      table { min-width: 650px; font-size: 0.85em; }
      
      th { font-size: 0.65em; padding: 8px 4px; border-bottom-width: 2px; }
      td { padding: 10px 4px; }
      
      .grand-total { font-size: 1.3em; padding: 20px; margin-top: 30px; }
      .manager-block { padding: 20px; }

      .desktop-only { display: none !important; }
      .sticky-header .manager-fast-contact { gap: 15px; }
      .sticky-header .manager-fast-contact a:hover { opacity: 0.8; }
    }
    
    @media (max-width: 450px) {
    }
    /* Print styles */
    @media print {
      body { background: white; }
      .container { box-shadow: none; margin: 0; padding: 0; width: 100%; max-width: 100%; }
      .sticky-header { display: none; }
      .section { border: 1px solid #eee; break-inside: avoid; }
      .grand-total { background: #000; color: #fff; -webkit-print-color-adjust: exact; }
      .manager-block { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <div class="sticky-header">
    <div class="brand-area">
      <img src="./logo/smaster.png" alt="Logo" class="logo-img">
    </div>
    <div class="manager-header-info">
        <div class="manager-details">
            <div class="manager-name">${manager.name}</div>
            <div class="manager-post">${manager.post || "Менеджер"}</div>
        </div>
        ${manager.avatar ? `<img src="${manager.avatar}" class="manager-avatar-img">` : ""}
    </div>
    <div class="manager-fast-contact">
      ${manager.phone ? `<a href="tel:${phoneTel}">📞 ${phoneDisplay}</a>` : ""}
      ${tgHandle ? `
        <a href="${tgLink}" title="Telegram" class="tg-contact-link">
          <img src="https://standartmaster.ru/kp/logo/tg.png" alt="TG" class="tg-header-icon">
          <span class="desktop-only">@${tgHandle}</span>
        </a>
      ` : ""}
    </div>
  </div>

  <div id="expired-banner">
    <h1>ПРЕДЛОЖЕНИЕ ИСТЕКЛО</h1>
    <p>Указанные условия и цены больше не актуальны.</p>
    <div class="contact-card-exp">
      <h3>Свяжитесь с менеджером для обновления:</h3>
      <p style="font-size: 1.2em; font-weight: 700; margin-bottom: 15px;">${manager.name}</p>
      ${manager.phone ? `<p style="margin: 10px 0;">Телефон: <a href="tel:${phoneTel}">${phoneDisplay}</a></p>` : ""}
      ${manager.email ? `<p style="margin: 10px 0;">E-mail: <a href="mailto:${manager.email}">${manager.email}</a></p>` : ""}
      ${tgHandle ? `<p style="margin: 10px 0;">Telegram: <a href="${tgLink}">@${tgHandle}</a></p>` : ""}
    </div>
  </div>

  <div class="container">
    <div class="main-header">
      <div class="header-left">
        <h1>Коммерческое предложение</h1>
        <div class="meta">
          <div>Дата: <b style="color: var(--brand-red);">${createdDate.toLocaleDateString("ru-RU")}</b></div>
          <div>Коммерческое предложение действует до <b style="color: var(--brand-red);">${validUntil.toLocaleDateString("ru-RU")}</b></div>
        </div>
      </div>
      <div class="company-info">
        <img src="./logo/smaster.png" alt="Company Logo" class="company-logo-main">
        <div style="font-weight: 800; color: var(--brand-black); margin-bottom: 5px;">${company.name}</div>
        <div>${company.address || ""}</div>
      </div>
    </div>

    <!-- Manager Detailed Header -->
    <div class="manager-block">
      <div class="manager-avatar">
        ${manager.avatar ? `<img src="${manager.avatar}" alt="Manager">` : ""}
      </div>
      <div class="manager-info">
        <div class="manager-name">${manager.name}</div>
        <div class="manager-post">${manager.post || "Ваш персональный менеджер"}</div>
        <div class="manager-links">
           ${manager.phone ? `<a href="tel:${phoneTel}">📞 ${phoneDisplay}</a>` : ""}
           ${manager.email ? `<a href="mailto:${manager.email}">✉️ ${manager.email}</a>` : ""}
           ${tgHandle ? `<a href="${tgLink}">✈️ Telegram</a>` : ""}
        </div>
      </div>
    </div>

    <div class="client-layout" style="display: flex; justify-content: space-between; gap: 40px; margin-bottom: 40px; align-items: stretch;">
        <div class="intro" style="flex: 1; display: flex; flex-direction: column; justify-content: center; font-size: 1.1em; color: var(--text-main); font-weight: 500;">
          Уважаемый клиент!<br>
          Рассмотрите наше предложение по автоматизации вашего бизнеса на базе самых надежных решений.
        </div>
        <div class="client-card">
          <h4>ПОЛУЧАТЕЛЬ:</h4>
          <div class="jur-name">${model.meta.client?.juridicalName || model.meta.client?.name || "Клиент"}</div>
          ${model.meta.client?.inn ? `<div class="inn-label">ИНН: ${model.meta.client.inn}</div>` : ""}
        </div>
    </div>

    ${renderServicesTable(model.sections.services.items, model.sections.services)}
    ${renderLicensesTable(model.sections.licenses.items, model.sections.licenses)}
    ${renderTrainingsTable(model.sections.trainings.items, model.sections.trainings)}
    ${renderEquipmentTable(model.sections.equipment.items, model.sections.equipment)}
    ${maintBlock}

    <div class="grand-total">
      <div class="label">Итоговая стоимость<br>по предложению:</div>
      <div><b>${formatMoney(model.total)}</b></div>
    </div>

    <!-- Summary Breakdown Table -->
    <div class="section" style="margin-top: 50px; background: white; border: 2px solid var(--brand-black);">
      <h2 style="font-size: 1.25em;">Сводная информация по разделам</h2>
      <table class="summary-table">
        <tr>
          <th>Категория</th>
          <th class="right">Сумма без скидки</th>
          <th class="right">Итого со скидкой</th>
        </tr>
        ${[
          { name: "Программное обеспечение (Лицензии)", sec: model.sections.licenses },
          { name: "Обучение персонала", sec: model.sections.trainings },
          { name: "Торговое оборудование и техника", sec: model.sections.equipment },
          { name: "Работы и услуги по внедрению", sec: model.sections.services },
          { name: "Техническое обслуживание", sec: model.sections.maintenance }
        ].filter(row => row.sec.total > 0 || (row.sec.items && row.sec.items.length > 0)).map(row => {
          const hasLocalDiscount = (row.sec.items && row.sec.items.some(i => (i.discountPercent || 0) > 0)) || (row.sec.discountPercent > 0);
          return `
          <tr>
            <td style="font-weight: 600;">${row.name}</td>
            <td class="right">${hasLocalDiscount ? formatMoney(row.sec.subtotal || row.sec.total) : "—"}</td>
            <td class="right" style="font-weight: 800; color: var(--brand-red);">${formatMoney(row.sec.total)}</td>
          </tr>
          `;
        }).join("")}
        <tr style="background: var(--brand-gray);">
          <td style="font-weight: 800; text-transform: uppercase;">ИТОГО ПО ВСЕМ РАЗДЕЛАМ:</td>
          <td class="right" style="font-weight: 800;">${formatMoney(
            model.sections.services.subtotal + 
            model.sections.equipment.subtotal + 
            model.sections.licenses.subtotal + 
            model.sections.trainings.subtotal +
            model.sections.maintenance.subtotal
          )}</td>
          <td class="right" style="font-weight: 900; color: var(--brand-red); font-size: 1.2em;">${formatMoney(model.total)}</td>
        </tr>
      </table>
    </div>

    <div style="margin-top: 30px; font-size: 0.85em; color: var(--text-muted); padding: 0 10px;">
      * Коммерческое предложение действует до <b>${validUntil.toLocaleDateString("ru-RU")}</b> года. Поставщик оставляет за собой право пересчета цен в случае изменения курсов валют или условий вендоров.
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
  const match = htmlString.match(
    /<script id="kp-data-b64" type="application\/json">([^<]+)<\/script>/,
  );
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
