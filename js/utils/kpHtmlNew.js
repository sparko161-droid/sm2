import { getKpCompanyConfig } from "../config.js";
import { formatMoney } from "./kpCalc.js";

/**
 * Generates the NEW "Landing Page" style HTML string for the KP.
 */
export function renderKpHtmlNew(model) {
  const company = getKpCompanyConfig();
  const manager = model.meta.manager;

  // Icons
  const ICONS = {
    check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
    arrow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`,
    star: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    shield: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`
  };

  const jsonStr = JSON.stringify(model);
  const base64Data = btoa(unescape(encodeURIComponent(jsonStr)));

  // Calculate Global Totals for discount logic
  const sectionsKeys = ['services', 'licenses', 'equipment', 'trainings'];
  let globalBaseTotal = sectionsKeys.reduce((acc, key) => {
    return acc + (model.sections[key]?.items || []).reduce((sum, item) => sum + (item.price * item.qty), 0);
  }, 0);
  if (model.sections.maintenance && model.sections.maintenance.total > 0) {
    globalBaseTotal += model.sections.maintenance.subtotal;
  }
  const hasGlobalDiscounts = globalBaseTotal > model.total;

  // Breakdown Base Calculations
  const servicesBase = (model.sections.services?.items || []).reduce((sum, i) => sum + (i.price * i.qty), 0);
  const equipmentBase = (model.sections.equipment?.items || []).reduce((sum, i) => sum + (i.price * i.qty), 0);
  const trainingsBase = (model.sections.trainings?.items || []).reduce((sum, i) => sum + (i.price * i.qty), 0);
  const licensesBase = (model.sections.licenses?.items || []).reduce((sum, i) => sum + (i.price * i.qty), 0);
  
  const onceBase = servicesBase + equipmentBase + trainingsBase;
  const onceActual = (model.sections.services?.total || 0) + (model.sections.equipment?.total || 0) + (model.sections.trainings?.total || 0);
  
  const licensesActual = model.sections.licenses?.total || 0;
  
  const maintenanceBaseMonthly = (model.sections.maintenance?.basePrice || 0) * (model.sections.maintenance?.terminals || 1);
  const maintenanceActualMonthly = (model.sections.maintenance?.unitPrice || 0) * (model.sections.maintenance?.terminals || 1);
  
  const futureBase = licensesBase + maintenanceBaseMonthly;
  const futureActual = licensesActual + maintenanceActualMonthly;

  // 2. Dates
  const createdDate = new Date(model.meta.createdAt);
  const dateStr = createdDate.toLocaleDateString("ru-RU");
  const validDaysNum = Number(model.meta.validDays) || 1;
  const validUntil = new Date(
    createdDate.getFullYear(),
    createdDate.getMonth(),
    createdDate.getDate() + validDaysNum - 1
  );
  const validUntilStr = validUntil.toLocaleDateString("ru-RU");

  // 3. Manager Contacts
  const tgHandle = (manager.tg || "").replace(/^@/, "");
  const tgLink = tgHandle ? `https://t.me/${tgHandle}` : "";
  const phoneTel = (manager.phone || "").replace(/[^\d+]/g, "");
  
  const formatPhone = (p) => {
    const d = p.replace(/\D/g, "");
    if (d.length === 11) {
      return `+${d[0]} (${d.slice(1,4)}) ${d.slice(4,7)} ${d.slice(7,9)}-${d.slice(9,11)}`;
    }
    return p;
  };
  const phoneDisplay = formatPhone(manager.phone || "");

  // 4. Section Renderers (adapted for new style)
  const renderTable = (title, items, section, hasPhoto = false, id = "") => {
    if (!items || !items.length) return "";
    const hasDiscounts = items.some(i => (i.discountPercent || 0) > 0);
    const sectionBaseTotal = items.reduce((acc, i) => acc + (i.price * i.qty), 0);
    const sectionTotal = section.total;
    const colCount = hasPhoto ? 5 : 4;
    
    return `
      <h4 id="${id}" style="margin:16px 0 8px; color: var(--accent); font-weight: 800; font-size: 15px; text-transform: uppercase;">${title}</h4>
      <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${hasPhoto ? '<th class="col-photo" width="60">Фото</th>' : ''}
            <th class="col-name">Наименование</th>
            <th class="col-qty center" width="60">Кол-во</th>
            <th class="col-price right" width="100">Цена</th>
            <th class="col-total right" width="110">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(i => {
            const photoSrc = i.photo?.base64Data ? `data:image/jpeg;base64,${i.photo.base64Data}` : null;
            const photoHtml = hasPhoto ? (photoSrc ? `<img src="${photoSrc}" style="width:50px; height:50px; object-fit:cover; border-radius:8px;">` : '—') : '';
            
            return `
            <tr>
              ${hasPhoto ? `<td class="col-photo">${photoHtml}</td>` : ''}
              <td class="col-name">
                <b>${i.name || ""}</b>
                ${i.description ? `<br><span class="muted" style="font-size:11px;">${i.description}</span>` : ""}
              </td>
              <td class="col-qty center">${i.qty}</td>
              <td class="col-price right">${formatMoney(i.price)}</td>
              <td class="col-total right" style="font-weight:700;">
                ${(i.discountPercent || 0) > 0 
                  ? `<div style="color: var(--accent);">${formatMoney(i.total)}</div><div class="muted" style="text-decoration:line-through; font-size:11px; font-weight:normal;">${formatMoney(i.price * i.qty)}</div>` 
                  : formatMoney(i.total || i.qty * i.price)}
              </td>
            </tr>
            `;
          }).join("")}
        </tbody>
        <tfoot>
           ${hasDiscounts ? `
             <tr class="foot-base">
                <td colspan="${colCount - 1}" class="right foot-lbl">Итого без скидки:</td>
                <td class="right foot-val foot-base-val">${formatMoney(sectionBaseTotal)}</td>
             </tr>
             <tr class="foot-total">
                <td colspan="${colCount - 1}" class="right foot-lbl">Итого со скидкой:</td>
                <td class="right foot-val foot-total-val">${formatMoney(sectionTotal)}</td>
             </tr>
           ` : `
             <tr class="foot-total">
                <td colspan="${colCount - 1}" class="right foot-lbl">Итого:</td>
                <td class="right foot-val foot-total-val">${formatMoney(sectionTotal)}</td>
             </tr>
           `}
        </tfoot>
      </table>
      </div>
    `;
  };

  const maint = model.sections.maintenance;
  const maintBlock = maint.total > 0 ? `
    <h4 style="margin:16px 0 8px; color: var(--accent); font-weight: 800; font-size: 15px; text-transform: uppercase;">Техподдержка и сопровождение</h4>
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Состав</th><th class="right">Стоимость</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <b>Техническое обслуживание и iiko после запуска</b><br>
            <span class="muted">За ${maint.terminals} р.м., включено: сопровождение 24/7, личный чат, обновления.</span>
          </td>
          <td class="right">
            <div><b style="color: var(--accent);">${formatMoney(maint.unitPrice * (maint.terminals || 1))}/мес</b></div>
            ${maint.discountPercent > 0 ? `<div class="muted" style="text-decoration:line-through; font-size:11px;">${formatMoney(maint.basePrice * (maint.terminals || 1))}/мес</div>` : ''}
          </td>
        </tr>
      </tbody>
      <tfoot>
          ${maint.discountPercent > 0 ? `
            <tr>
              <td class="right" style="border-bottom:none; padding-bottom:4px;">Итого без скидки (за ${maint.months} мес):</td>
              <td class="right" style="border-bottom:none; padding-bottom:4px; font-weight:600; text-decoration:line-through; color:var(--muted);">${formatMoney(maint.subtotal)}</td>
            </tr>
            <tr>
              <td class="right" style="font-weight:700; border-top:none; padding-top:0;">Итого со скидкой (за ${maint.months} мес):</td>
              <td class="right" style="font-weight:900; color:var(--accent); font-size:1.2em; border-top:none; padding-top:0;">${formatMoney(maint.total)}</td>
            </tr>
          ` : `
            <tr>
              <td class="right" style="font-weight:700;">Итого (за ${maint.months} мес):</td>
              <td class="right" style="font-weight:900; color:var(--text-main); font-size:1.1em;">${formatMoney(maint.total)}</td>
            </tr>
          `}
          <tr>
            <td colspan="2" class="right" style="font-size: 0.85em; color: var(--muted); border-top: 1px dashed var(--border); padding-top: 8px;">
               Далее стоимость: 
               <span style="color: var(--accent); font-weight: 700;">${formatMoney(maint.unitPrice * (maint.terminals || 1))}/мес</span>
               ${maint.discountPercent > 0 ? `<span style="text-decoration: line-through; margin-left: 5px; font-size: 0.9em;">${formatMoney(maint.basePrice * (maint.terminals || 1))}/мес</span>` : ''}
            </td>
          </tr>
      </tfoot>
    </table>
    </div>
  ` : "";

  // 5. Expiration Logic Script
  const expirationScript = `
    <script>
      (function() {
        try {
          var dataEl = document.getElementById("kp-data-b64");
          if(dataEl) {
            var json = decodeURIComponent(escape(atob(dataEl.textContent)));
            var model = JSON.parse(json);
            var created = new Date(model.meta.createdAt);
            var validDays = Number(model.meta.validDays) || 1;
            // Полночь через N дней после дня создания
            var expires = new Date(created.getFullYear(), created.getMonth(), created.getDate() + validDays).getTime();
            
            if (Date.now() > expires) {
              // Apply blur + grayscale to content
              document.body.style.filter = "grayscale(1) blur(3px) opacity(0.6)";
              document.body.style.pointerEvents = "none";
              document.body.title = "Это предложение истекло";
              
              // Show expiration modal
              showExpirationModal(model);
            } else {
              // Инициализация таймера
              initScarcityBanner(expires);
              
              // Glare Effect - Removed (Simplified Glass)
            }
          }
        } catch(e) {}
      })();

      function initScarcityBanner(expiresTime) {
        var banner = document.getElementById("scarcity-banner");
        if (!banner) return;

        var isClosed = false;
        var closeBtn = document.getElementById("scarcity-close");
        if (closeBtn) {
          closeBtn.onclick = function() {
            isClosed = true;
            banner.classList.remove("visible");
          };
        }

        // Показ через 1 минуту
        setTimeout(function() {
          if (!isClosed) {
            banner.classList.add("visible");
          }
        }, 1 * 60 * 1000);

        function updateTimer() {
          var now = Date.now();
          var diff = expiresTime - now;
          if (diff <= 0) {
            banner.classList.remove("visible");
            document.body.style.filter = "grayscale(1) opacity(0.5)";
            return;
          }

          var d = Math.floor(diff / (1000 * 60 * 60 * 24));
          var h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          var s = Math.floor((diff % (1000 * 60)) / 1000);

          document.getElementById("t-days").textContent = d < 10 ? "0" + d : d;
          document.getElementById("t-hours").textContent = h < 10 ? "0" + h : h;
          document.getElementById("t-mins").textContent = m < 10 ? "0" + m : m;
          document.getElementById("t-secs").textContent = s < 10 ? "0" + s : s;
        }

        setInterval(updateTimer, 1000);
        updateTimer();
      }

      function toggleFaq(el) {
        el.parentElement.classList.toggle('active');
      }

      // Скрипт для кнопки "Наверх"
      window.addEventListener('scroll', function() {
        const topBtn = document.getElementById('back-to-top');
        if (topBtn) {
          if (window.scrollY > 500) {
            topBtn.classList.add('visible');
          } else {
            topBtn.classList.remove('visible');
          }
        }
      });

      function scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // Expired KP Modal
      function showExpirationModal(model) {
        var manager = model.meta.manager || {};
        var managerName = manager.name || 'Менеджер';
        var managerEmail = manager.email || 'info@standartmaster.ru';
        
        // Extract phone and telegram from header buttons
        var phoneBtn = document.querySelector('.topbar a[href^="tel:"]');
        var tgBtn = document.querySelector('.topbar a[href*="t.me"], .topbar a.telegram');
        var phoneTel = phoneBtn ? phoneBtn.getAttribute('href').replace('tel:', '') : '';
        var tgLink = tgBtn ? tgBtn.getAttribute('href') : '';
        
        // Create overlay
        var overlay = document.createElement('div');
        overlay.id = 'expiration-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        
        // Create modal
        var modal = document.createElement('div');
        modal.style.cssText = 'background:white;border-radius:20px;padding:40px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
        modal.innerHTML = '<div style=\"font-size:48px;margin-bottom:16px;\">⏰</div>' +
          '<h2 style=\"margin:0 0 12px;font-size:24px;color:#1a202c;\">Предложение устарело</h2>' +
          '<p style=\"color:#718096;margin-bottom:24px;font-size:15px;\">Срок действия этого коммерческого предложения истёк. Свяжитесь с менеджером для получения актуальной версии.</p>' +
          '<div style=\"background:#f7fafc;border-radius:12px;padding:16px;margin-bottom:24px;\">' +
            '<div style=\"font-weight:700;color:#1a202c;font-size:16px;\">' + managerName + '</div>' +
            '<div style=\"color:#718096;font-size:13px;\">Ваш персональный менеджер</div>' +
          '</div>' +
          '<div style=\"display:flex;flex-direction:column;gap:10px;\">' +
            (phoneTel ? '<a href=\"tel:' + phoneTel + '\" style=\"display:block;padding:14px;background:#d20000;color:white;border-radius:12px;font-weight:700;text-decoration:none;\">📞 Позвонить</a>' : '') +
            '<a href=\"mailto:' + managerEmail + '\" style=\"display:block;padding:14px;background:#319795;color:white;border-radius:12px;font-weight:700;text-decoration:none;\">✉️ Написать на почту</a>' +
            (tgLink ? '<a href=\"' + tgLink + '\" style=\"display:block;padding:14px;background:#0088cc;color:white;border-radius:12px;font-weight:700;text-decoration:none;\">💬 Написать в Telegram</a>' : '') +
          '</div>';
        
        overlay.appendChild(modal);
        document.body.parentNode.appendChild(overlay);
      }


      // Показ плавающего футера только на мобильных
      function updateMobileFooter() {
        var footer = document.getElementById('mobile-price-footer');
        var breakdown = document.getElementById('mobile-footer-breakdown');
        if (!footer) return;
        if (window.innerWidth <= 640) {
          footer.style.display = 'flex';
          if (breakdown) breakdown.style.display = 'flex';
        } else {
          footer.style.display = 'none';
          if (breakdown) breakdown.style.display = 'none';
        }
      }
      window.addEventListener('resize', updateMobileFooter);
      updateMobileFooter();

      // Smooth Scroll for ALL anchor links on the page
      document.addEventListener('click', function(e) {
        var target = e.target.closest('a[href^="#"]');
        if (target) {
          e.preventDefault();
          var targetId = target.getAttribute('href').substring(1);
          var targetEl = document.getElementById(targetId);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (targetId === 'top' || targetId === '') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      });
    </script>
  `;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>КП ${model.meta.client?.name || ""} — ${company.name}</title>
  <style>
    :root {
      --muted: #718096;
      --text: #2d3748;
      --text-main: #1a202c;
      --accent: #d20000;
      --accent-light: #fff5f5;
      --accent2: #319795;
      --border: #e2e8f0;
      --border-light: #edf2f7;
      --shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -1px rgba(0,0,0,.06);
      --radius: 20px;
      --max: 1080px;
      --bg-page: #f7fafc;
      --bg-card: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Arial,sans-serif;
      background-color: var(--bg-page);
      background-image: 
        radial-gradient(at 0% 0%, rgba(210,0,0,0.03) 0, transparent 50%), 
        radial-gradient(at 50% 0%, rgba(49,151,149,0.03) 0, transparent 50%);
      color: var(--text);
      line-height: 1.5;
    }
    a { color: inherit; text-decoration: none; }
    .wrap { max-width: var(--max); margin: 0 auto; padding: 24px 16px 80px; }
    
    .topbar {
      display: flex; gap: 12px; align-items: center; justify-content: space-between;
      padding: 6px 16px; border-radius: 14px;
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.5);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.6);
      position: sticky; top: 10px; z-index: 1000;
    }
    .brand { display:flex; gap:10px; align-items:center; flex-shrink: 0; }
    .logo-img { height: 32px; width: auto; object-fit: contain; }
    .brand h1 { font-size: 13px; margin:0; font-weight: 800; color: var(--text-main); white-space: nowrap; }
    .brand-meta { display: block; font-size: 10px; color: var(--muted); white-space: nowrap; }
    
    .actions { display:flex; gap:8px; flex-wrap: nowrap; justify-content:flex-end; flex-shrink: 0; }
    .btn {
      padding: 8px 16px; border-radius: 10px; border: 1px solid transparent;
      background: var(--bg-card);
      font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
      color: var(--text-main);
      display: inline-flex; align-items: center; gap: 6px;
      position: relative; overflow: hidden;
      white-space: nowrap; /* Force one line */
    }
    .btn::after {
      content: ''; position: absolute; top: -50%; left: -100%; width: 200%; height: 200%;
      background: linear-gradient(45deg, transparent, rgba(255,255,255,0.4), transparent);
      transform: rotate(45deg); transition: 0s; pointer-events: none;
    }
    .btn:hover::after { left: 100%; transition: 0.8s cubic-bezier(0.23, 1, 0.32, 1); }
    .btn.primary { 
      background: var(--accent); color: white; 
      box-shadow: 0 4px 15px rgba(210, 0, 0, 0.2); 
    }
    .btn.primary:hover { 
      background: #b00000; transform: translateY(-3px) scale(1.02); 
      box-shadow: 0 12px 25px rgba(210, 0, 0, 0.3); 
    }
    .btn.secondary { 
      background: rgba(241, 245, 249, 0.8); 
      color: var(--text-main); 
      border: 1px solid rgba(255, 255, 255, 0.4);
      backdrop-filter: blur(10px);
    }
    .btn.secondary:hover { 
      background: rgba(255, 255, 255, 0.8); transform: translateY(-3px) scale(1.02); 
      box-shadow: 0 8px 20px rgba(0,0,0,0.08);
    }
    .btn.telegram {
      background: rgba(0, 136, 204, 0.1);
      color: #0088cc;
      border: 1px solid rgba(0, 136, 204, 0.2);
      backdrop-filter: blur(10px);
    }
    .btn.telegram:hover {
      background: rgba(0, 136, 204, 0.2);
      transform: translateY(-3px) scale(1.02);
      box-shadow: 0 8px 20px rgba(0, 136, 204, 0.15);
    }
    .btn svg { opacity: 0.9; }

    .cta-actions { display:flex; gap:16px; flex-wrap:wrap; justify-content: center; }
    .cta-btn { 
      min-width: 280px; 
      justify-content: center; 
      padding: 16px 32px !important; 
      font-size: 16px !important;
      border-radius: 18px !important;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1) !important;
    }
    .btn.tg-solid { background: #0088cc !important; border-color: #0088cc !important; color: #fff !important; }

    .grid { display:grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; margin-top: 24px; align-items: start; }
    @media (min-width: 981px) {
      .column-sticky { position: sticky; top: 90px; }
    }
    @media (max-width: 980px) { 
      .grid { grid-template-columns: 1fr; } 
      .topbar { 
        position: sticky; top: 0; padding: 4px 12px; 
        flex-direction: column; align-items: stretch; gap: 6px;
        background: linear-gradient(135deg, rgba(230, 240, 250, 0.6), rgba(215, 230, 245, 0.35));
        border-radius: 0 0 16px 16px;
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.9), 0 8px 32px rgba(0,0,0,0.05);
      } 
      .brand { display: flex; align-items: center; gap: 8px; }
      .logo-img { height: 22px; }
      .brand h1 { font-size: 12px; line-height: 1; }
      .brand-meta { font-size: 9px; margin-top: 1px; opacity: 0.8; }
      
      .actions { display: flex; gap: 4px; width: 100%; justify-content: space-between; }
      .btn { padding: 4px 4px; font-size: 10px; flex: 1; justify-content: center; border-radius: 6px; }
      .btn span + span { display: inline; } /* Show text on mobile now as buttons are full width */
      .btn.primary { flex: 1.4; }
      
      .cta-actions { flex-direction: column; align-items: center; gap: 12px; }
      .cta-btn { width: 100%; max-width: 360px; min-width: auto; }
    }

    .card {
      position: relative; /* Added for liquid glare context */
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 32px;
      margin-bottom: 24px;
    }
    .hero h2 { margin: 0 0 16px; font-size: 34px; line-height: 1.15; font-weight: 900; color: var(--text-main); letter-spacing: -0.02em; }
    .hero .sub { color: var(--muted); margin: 0 0 32px; font-size: 17px; max-width: 600px; }

    .bullets { display:grid; gap: 14px; margin-top: 20px; }
    .bullet { display:flex; gap: 16px; align-items:flex-start; padding: 20px; border-radius: 18px; border: 1px solid var(--border); background: #f8fafc; transition: all 0.2s; }
    .bullet:hover { border-color: var(--accent); background: white; }
    .bullet-icon { flex: 0 0 24px; color: var(--accent); margin-top: 2px; }
    
    .kpi { display:grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 24px; }
    @media (max-width: 480px) { .kpi { grid-template-columns: 1fr; } }
    .kpi .item { border: 1px solid var(--border); border-radius: 18px; padding: 20px; background: #fff; text-align: center; transition: all 0.2s; }
    .kpi .item:hover { border-color: var(--accent); transform: scale(1.02); }
    .kpi .num { font-weight: 900; font-size: 24px; color: var(--accent); }
    .kpi .lbl { color: var(--muted); font-size: 11px; margin-top: 6px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }

    .section-title { display:flex; align-items: center; gap: 12px; margin-bottom: 20px; border-bottom: 3px solid var(--accent); padding-bottom: 10px; width: fit-content; }
    .section-title h3 { margin:0; font-size: 20px; color: var(--text-main); font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em; }
    .section-title span { color: var(--muted); font-size: 13px; font-weight: 500; }

    /* Conversion Blocks */
    .m-block { margin-top: 40px; }
    .m-title { font-size: 22px; font-weight: 900; margin-bottom: 20px; color: var(--text-main); text-align: center; }
    .m-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    @media (max-width: 640px) { .m-grid { grid-template-columns: 1fr; } }
    .m-card { padding: 20px; border-radius: 18px; border: 1px solid var(--border); background: #fff; transition: all 0.2s; }
    .m-card:hover { border-color: var(--accent); box-shadow: var(--shadow); }
    .m-card h4 { margin: 0 0 8px; font-size: 16px; font-weight: 800; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
    .m-card p { margin: 0; font-size: 14px; color: var(--muted); line-height: 1.4; }
    .m-icon { color: var(--accent); }

    .problem-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
    .problem-item { display: flex; gap: 12px; align-items: center; padding: 12px 18px; background: #fef2f2; border-radius: 12px; border: 1px solid #fee2e2; color: #991b1b; font-size: 14px; font-weight: 500; }
    
    .solution-list { display: flex; flex-direction: column; gap: 12px; }
    .solution-item { display: flex; gap: 12px; align-items: center; padding: 12px 18px; background: #f0fdf4; border-radius: 12px; border: 1px solid #dcfce7; color: #166534; font-size: 14px; font-weight: 600; }

    .brands-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); 
      gap: 20px; 
      align-items: center; 
      justify-items: center;
      margin-top: 20px;
    }
    .brand-logo-wrap { 
      background: #2d3748; 
      padding: 12px; 
      border-radius: 12px; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      width: 100%; 
      height: 64px; 
      transition: all 0.3s;
    }
    .brand-logo { 
      max-width: 100%; 
      max-height: 40px; 
      filter: grayscale(1) brightness(200%); 
      opacity: 0.8; 
      transition: all 0.3s; 
    }
    .brand-logo-wrap:hover { background: #1a202c; transform: translateY(-2px); }
    .brand-logo-wrap:hover .brand-logo { filter: grayscale(0) brightness(100%); opacity: 1; transform: scale(1.05); }

    .steps { display:flex; justify-content: center; gap: 16px; flex-wrap: wrap; }
    @media (max-width: 760px) { .steps { grid-template-columns: 1fr; } }
    .step { border: 1px solid var(--border); border-radius: 18px; padding: 24px; background: #f8fafc; position: relative; flex: 1; max-width: 400px; min-width: 280px; }
    .step b { display:block; margin-bottom: 8px; color: var(--text-main); font-size: 16px; font-weight: 800; }
    .step .muted { font-size: 14px; }
    
    .faq { margin-top: 30px; }
    .faq-item { border-bottom: 1px solid var(--border); padding: 16px 0; }
    .faq-item:last-child { border-bottom: none; }
    .faq-q { font-weight: 800; color: var(--text-main); cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 15px; transition: color 0.2s; }
    .faq-q:hover { color: var(--accent); }
    .faq-q::after { content: '+'; font-size: 18px; color: var(--muted); }
    .faq-item.active .faq-q::after { content: '−'; }
    .faq-a { padding-top: 10px; font-size: 14px; color: var(--muted); display: none; }
    .faq-item.active .faq-a { display: block; }
    
    .table-wrap { width: 100%; overflow-x: auto; margin-top: 10px; border-radius: 14px; border: 1px solid var(--border); }
    table { width:100%; border-collapse: collapse; min-width: 500px; }
    th, td { padding: 16px; border-bottom: 1px solid var(--border); vertical-align: middle; font-size: 14px; }
    th { text-align:left; color: var(--muted); background: #f8fafc; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; font-size: 11px; }
    tr:hover td { background: rgba(248,250,252,0.5); }
    .right { text-align: right; }
    .center { text-align: center; }

    .pill { display:inline-block; padding: 8px 16px; border-radius: 999px; border: 1px solid var(--border); background: #f1f5f9; color: var(--text-main); font-size: 12px; margin: 0 8px 8px 0; font-weight: 700; }
    
    .totals { display:grid; grid-template-columns: 1fr; gap: 14px; margin-top: 16px; }
    .total-row { display: grid; grid-template-columns: 1fr auto; align-items: flex-start; gap: 16px; padding: 20px; border-radius: 18px; border: 1px solid var(--border); background: #f8fafc; font-size: 15px; }
    .total-row.main { border-color: #feb2b2; background: var(--accent-light); box-shadow: 0 4px 6px rgba(210,0,0,0.05); }
    .total-row b { font-size: 20px; color: var(--text-main); font-weight: 900; line-height: 1.2; }
    .total-row .price { text-align: right; white-space: nowrap; }
    
    .note { margin-top: 20px; font-size: 13px; color: var(--muted); line-height: 1.6; font-style: italic; }

    .scarcity-banner {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(100px);
      z-index: 1001; width: 93%; max-width: 620px; padding: 24px 32px;
      background: linear-gradient(135deg, rgba(180, 0, 0, 0.6), rgba(140, 0, 0, 0.3));
      backdrop-filter: blur(28px) saturate(200%);
      -webkit-backdrop-filter: blur(28px) saturate(200%);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white; border-radius: 24px; box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.5), 0 12px 40px rgba(180, 0, 0, 0.3);
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1);
      opacity: 0; pointer-events: none; text-align: center;
    }
    .scarcity-banner.visible { transform: translateX(-50%) translateY(0); opacity: 1; pointer-events: all; }
    .scarcity-close { position: absolute; top: 12px; right: 12px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0.6; transition: opacity 0.2s; color: white; font-weight: bold; font-size: 18px; }
    .scarcity-close:hover { opacity: 1; }
    .scarcity-banner h4 { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: 0.5px; }
    .scarcity-banner p { margin: 0; font-size: 13px; opacity: 0.9; }
    .scarcity-timer { display: flex; gap: 16px; margin-top: 4px; }
    .timer-unit { display: flex; flex-direction: column; align-items: center; min-width: 40px; }
    .timer-val { font-size: 24px; font-weight: 900; font-family: 'Monaco', 'Consolas', monospace; }
    .timer-label { font-size: 10px; text-transform: uppercase; opacity: 0.7; font-weight: 700; margin-top: -2px; }

    /* Back to Top Button (Liquid Glass) */
    .back-to-top {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.2));
      backdrop-filter: blur(16px) saturate(200%);
      -webkit-backdrop-filter: blur(16px) saturate(200%);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.9), 0 8px 32px 0 rgba(31, 38, 135, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 1000;
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
      box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
      color: var(--text-main);
    }
    .back-to-top.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .back-to-top:hover {
      background: rgba(255, 255, 255, 0.6);
      transform: scale(1.1);
    }
    @media (max-width: 640px) {
      .back-to-top {
        bottom: 120px; /* Above the price footer */
        right: 16px;
        width: 40px;
        height: 40px;
      }
    }

    @media (max-width: 640px) {
      .wrap { padding: 16px 12px 160px; }
      .card { padding: 20px; margin-bottom: 16px; }
      .hero h2 { font-size: 22px; }
      .hero .sub { font-size: 15px; margin-bottom: 24px; }
      .bullet { padding: 16px; }
      .section-title h3 { font-size: 17px; }
      th, td { padding: 12px 8px; font-size: 12px; }
      
      .mobile-price-footer {
        display: flex; position: fixed; bottom: 0 !important; left: 0; right: 0;
        transform: translateZ(0); /* Force hardware stacking context */
        background: linear-gradient(180deg, rgba(230, 240, 250, 0.6), rgba(215, 230, 245, 0.4));
        backdrop-filter: blur(24px) saturate(200%);
        -webkit-backdrop-filter: blur(24px) saturate(200%);
        border-top: 1px solid rgba(255, 255, 255, 0.4);
        padding: 12px 16px; z-index: 999; justify-content: space-between; align-items: center;
        box-shadow: inset 0 1px 0px rgba(255, 255, 255, 0.6), 0 -8px 32px rgba(0,0,0,0.08);
      }
      .footer-price { display: flex; flex-direction: column; }
      .footer-price span { font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 700; }
      .footer-price b { font-size: 18px; color: var(--accent); font-weight: 900; }
      /* Simple Glass Blur Styles */
      .footer-btn { 
        background: linear-gradient(135deg, rgba(255, 59, 48, 0.9), rgba(215, 0, 21, 0.85));
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        color: white; padding: 12px 24px; border-radius: 14px; 
        font-weight: 800; font-size: 15px; text-align: center;
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.4), 0 8px 20px rgba(255, 59, 48, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        transition: transform 0.2s;
      }
      .footer-btn:active { transform: scale(0.96); }

      .mobile-footer-breakdown {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 16px;
        background: linear-gradient(180deg, rgba(230, 240, 250, 0.5), rgba(215, 230, 245, 0.3));
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border-top: 1px solid rgba(255, 255, 255, 0.3);
        position: fixed;
        bottom: 68px; /* Above the main footer */
        left: 0;
        right: 0;
        z-index: 998;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.04);
      }
      .breakdown-item { display: flex; flex-direction: column; align-items: center; flex: 1; border-right: 1px solid var(--border-light); }
      .breakdown-item:last-child { border-right: none; }
      .breakdown-item span { font-size: 9px; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
      .breakdown-item b { font-size: 12px; color: var(--text-main); white-space: nowrap; }
      .total-row { padding: 16px; gap: 12px; }
      .total-row b { font-size: 17px; }
      .scarcity-banner { width: 95%; padding: 16px; bottom: 16px; }
      .scarcity-timer { gap: 10px; }
      .timer-val { font-size: 20px; }

      /* Column Reordering for Mobile */
      table thead tr { display: grid; grid-template-columns: 2fr 1fr 0.8fr 1fr; border-bottom: 2px solid var(--border); }
      table thead th { border: none !important; }
      table tbody tr { display: grid; grid-template-columns: 2fr 1fr 0.8fr 1fr; border-bottom: 1px solid var(--border); }
      table td { border: none !important; }
      
      .col-photo { display: none !important; } /* Hide photo on small mobile grid to save space */
      .col-name { grid-column: span 1; order: 1; }
      .col-total { order: 2; text-align: left !important; }
      .col-qty { order: 3; text-align: center !important; }
      .col-price { order: 4; text-align: right !important; }

      /* Footer adjustments for sticky + grid */
      tfoot tr { 
        display: flex; 
        justify-content: flex-start; /* Move sums to the left */
        gap: 12px;
        background: white; 
        border-top: 1px solid var(--border);
        position: sticky;
        left: 0;
        width: fit-content;
        min-width: 100%;
        padding-right: 20px;
        z-index: 5;
      }
      .foot-lbl { flex: 0 0 auto; text-align: left !important; font-weight: 700; border: none !important; }
      .foot-val { flex: 0 0 auto; text-align: left !important; border: none !important; }
      .foot-total-val { font-size: 1.2em; color: var(--accent); font-weight: 900; }

      /* CTA Compactness */
      #cta { padding: 8px 16px 24px !important; margin-top: 12px !important; }
      #cta h3 { font-size: 19px !important; margin-bottom: 4px !important; margin-top: 0 !important; }
      #cta p { font-size: 13px !important; margin-bottom: 12px !important; }
      #cta .steps { margin-bottom: 20px !important; }
    }

    @media print {
      body { background: #fff !important; color:#000 !important; }
      .topbar, .btn, .actions, #cta { display:none !important; }
      .card { box-shadow:none !important; border:1px solid #ddd !important; background:#fff !important; color: #000 !important; margin-bottom: 10px !important; }
      table { border-color: #ddd !important; background: #fff !important; }
      th { background: #f0f0f0 !important; color: #000 !important; }
      td { border-bottom-color: #eee !important; color: #000 !important; }
      .wrap { padding: 0 !important; }
    }
  </style>
</head>

<body>
  <div class="wrap" id="top">
    <div class="topbar">
      <div class="brand">
        <img src="./logo/smaster.png" class="logo-img" alt="Стандарт Мастер Logo">
        <div>
          <h1>iiko Business Partner</h1>
          <div class="brand-meta">
            КП для ${model.meta.client?.name || "Вас"} от ${dateStr}
          </div>
        </div>
      </div>
      <div class="actions">
        ${manager.phone ? `<a class="btn secondary" href="tel:${phoneTel}"><span>📞</span><span>Позвонить</span></a>` : ""}
        ${tgLink ? `<a class="btn telegram" href="${tgLink}"><span>💬</span><span>Telegram</span></a>` : ""}
        <a class="btn primary" href="#cta"><span>🚀</span><span>Запустить проект</span></a>
      </div>
    </div>

    <div class="grid">
      <div class="column">
        <div class="card hero">
          <h2>Запустим iiko под ключ: касса + кухня + склад + отчёты — с поддержкой 24/7</h2>
          <p class="sub">Коммерческое предложение: сроки, этапы, стоимость и сопровождение после запуска для <b>${model.meta.client?.name || "Вашего бизнеса"}</b></p>
  
          <div class="bullets">
            <div class="bullet">
              <div class="bullet-icon">${ICONS.check}</div>
              <div><b>Запуск без простоев:</b> Настроим и проверим систему до открытия, чтобы вы начали работать без сбоев.</div>
            </div>
            <div class="bullet">
              <div class="bullet-icon">${ICONS.check}</div>
              <div><b>Обучение + Сопровождение:</b> Научим персонал и будем рядом в первые дни работы и далее 24/7.</div>
            </div>
            <div class="bullet">
              <div class="bullet-icon">${ICONS.check}</div>
              <div><b>Личный чат поддержки:</b> Прямая связь с техническими специалистами в Telegram и по горячей линии.</div>
            </div>
          </div>
  
          <div class="kpi">
            <div class="item"><div class="num">25+ лет</div><div class="lbl">опыта</div></div>
            <div class="item"><div class="num">3500+</div><div class="lbl">проектов</div></div>
            <div class="item"><div class="num">ТОП-15</div><div class="lbl">дилеров iiko</div></div>
            <div class="item"><div class="num">24/7</div><div class="lbl">поддержка</div></div>
          </div>
  
          <div style="margin-top: 32px; display: flex; gap: 16px; flex-wrap: wrap;">
            <a class="btn primary" style="padding: 14px 28px; font-size: 15px;" href="#cta">Согласовать запуск <span style="margin-left:8px;">${ICONS.arrow}</span></a>
            ${tgLink ? `<a class="btn secondary" style="padding: 14px 28px; font-size: 15px;" href="${tgLink}">Написать в Telegram</a>` : ""}
          </div>
        </div>
  
        <div class="card m-block">
          <h3 class="m-title">Что обычно «болит» у владельца ресторана</h3>
          <div class="problem-list">
            <div class="problem-item">${ICONS.error} Касса или принтеры «падают» в пиковые часы</div>
            <div class="problem-item">${ICONS.error} Склад не сходится, сложно найти ошибки в списаниях</div>
            <div class="problem-item">${ICONS.error} Персонал ошибается в заказах и тормозит сервис</div>
            <div class="problem-item">${ICONS.error} Нет прозрачного контроля выручки и фудкоста</div>
          </div>
          
          <h3 class="m-title" style="margin-top: 30px;">Как мы решаем эти задачи</h3>
          <div class="solution-list">
            <div class="solution-item">${ICONS.check} Проектируем iiko точно под ваш формат заведения</div>
            <div class="solution-item">${ICONS.check} Подбираем надежное оборудование с гарантией</div>
            <div class="solution-item">${ICONS.check} Проводим тестовый запуск и обучение сотрудников</div>
            <div class="solution-item">${ICONS.check} Обеспечиваем бесперебойную работу 24/7</div>
          </div>
        </div>

        <div class="card m-block">
          <h3 class="m-title">iiko — это не просто касса</h3>
          <div class="m-grid">
            <div class="m-card">
              <h4>${ICONS.star} Продажи и касса</h4>
              <p>Удобный интерфейс, быстрые чеки и работа без интернета.</p>
            </div>
            <div class="m-card">
              <h4>${ICONS.star} Склад и техкарты</h4>
              <p>Автоматическое списание, контроль остатков и инвентаризация.</p>
            </div>
            <div class="m-card">
              <h4>${ICONS.star} Кухня и выдача</h4>
              <p>Экран повара, контроль времени приготовления и алерты.</p>
            </div>
            <div class="m-card">
              <h4>${ICONS.star} Доставка</h4>
              <p>Интеграция с агрегаторами и собственная логистика.</p>
            </div>
            <div class="m-card">
              <h4>${ICONS.star} Отчеты и контроль</h4>
              <p>P&L, CashFlow и отчеты в реальном времени в вашем телефоне.</p>
            </div>
            <div class="m-card">
              <h4>${ICONS.star} Персонал</h4>
              <p>Гибкая мотивация, KPI и учет рабочего времени.</p>
            </div>
          </div>
        </div>

        <div class="card m-block">
          <h3 class="m-title">Почему «Стандарт Мастер»</h3>
          <div class="bullets">
            <div class="bullet">
              <div class="bullet-icon">${ICONS.shield}</div>
              <div><b>Экспертиза:</b> Мы единственный дилер с таким опытом на рынке автоматизации. Мы не просто продаём — мы отвечаем за стабильный запуск и работу системы.</div>
            </div>
            <div class="bullet">
              <div class="bullet-icon">${ICONS.shield}</div>
              <div><b>География и масштаб:</b> Работаем по всей России. В нашем портфеле как малые кафе, так и крупные сетевые проекты.</div>
            </div>
          </div>
          
          <h4 style="margin: 32px 0 16px; font-size: 14px; color: var(--muted); text-align: center; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">Нам доверяют лучшие:</h4>
          <div class="brands-grid">
            <div class="brand-logo-wrap"><img class="brand-logo" src="https://two-keys.ru/img/logo/meatbarrique-2.svg" alt="MeatBarrique"></div>
            <div class="brand-logo-wrap"><img class="brand-logo" src="https://two-keys.ru/img/logo/tavola-1.svg" alt="Tavola Perfetta"></div>
            <div class="brand-logo-wrap"><img class="brand-logo" src="https://olivka-tlt.ru/img/logo/white_logo.png?version=3" alt="Olivka"></div>
            <div class="brand-logo-wrap"><img class="brand-logo" src="https://static.tildacdn.com/tild3631-3462-4531-a462-646231386465/blue.png" alt="SkyBar"></div>
          </div>
        </div>
      </div>

      <div class="column column-sticky">
        <div class="card" id="brief-summary">
          <div class="section-title">
            <h3>Краткий итог</h3>
            <span>разово + подписка</span>
          </div>
  
          <div class="totals">
            <div class="total-row main">
              <span><b>Единоразово</b><br><small class="muted">Оборудование, внедрение, обслуживание (${maint.months} мес)</small></span>
              <b class="price">${formatMoney(model.total - model.sections.licenses.total)}</b>
            </div>
            
            ${model.sections.licenses.total > 0 ? `
            <div class="total-row">
              <span><b>Лицензии<br>(1-${maint.months} мес)</b><br><small class="muted">Программное обеспечение iiko</small></span>
              <b class="price">${formatMoney(model.sections.licenses.total)}/мес</b>
            </div>
            ` : ''}
  
            <div class="total-row">
              <span><b>Ежемесячно<br>(с ${maint.months + 1}-го мес)</b><br><small class="muted">Лицензии + сопровождение</small></span>
              <b class="price">${formatMoney(model.sections.licenses.total + (maint.unitPrice * (maint.terminals || 1)))}/мес</b>
            </div>
          </div>
  
          <div class="section-title" style="margin-top:20px;">
            <h3>Что включено</h3>
          </div>
  
          <div>
            ${model.sections.licenses.items.length ? '<span class="pill">ПО iiko</span>' : ''}
            ${model.sections.equipment.items.length ? '<span class="pill">Оборудование</span>' : ''}
            ${model.sections.services.items.length ? '<span class="pill">Установка и настройка</span>' : ''}
            ${model.sections.trainings.items.length ? '<span class="pill">Обучение персонала</span>' : ''}
            ${model.sections.maintenance.total > 0 ? '<span class="pill">Поддержка 24/7</span>' : ''}
          </div>
  
          <p class="note"><b>Разово</b> — запуск и оборудование, 1-3 месяц технической поддержки. <b>Ежемесячно</b> — лицензия и сопровождение 4-ый и следующие месяца.</p>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 16px;">
      <div class="section-title">
        <h3>Этапы запуска</h3>
        <span>3 простых шага</span>
      </div>
      <div class="steps">
        <div class="step"><b>1) Уточняем детали</b><div class="muted">Финальное согласование состава оборудования и количества рабочих мест.</div></div>
        <div class="step"><b>2) Настройка и монтаж</b><div class="muted">Подготовка базы данных, настройка оборудования и обучение сотрудников.</div></div>
        <div class="step"><b>3) Открытие и поддержка</b><div class="muted">Сопровождение в день запуска и непрерывная поддержка вашего бизнеса 24/7.</div></div>
      </div>
    </div>

    <div class="card" id="specifications" style="margin-top: 16px;">
      <div class="section-title">
        <h3>Детальная спецификация</h3>
        <span>состав и стоимость</span>
      </div>

      ${renderTable("Программное обеспечение (Лицензии)", model.sections.licenses.items, model.sections.licenses, false, "spec-licenses")}
      ${renderTable("Оборудование и техника", model.sections.equipment.items, model.sections.equipment, true, "spec-equipment")}
      ${renderTable("Работы по внедрению и запуску", model.sections.services.items, model.sections.services, false, "spec-services")}
      ${renderTable("Обучение персонала", model.sections.trainings.items, model.sections.trainings, false, "spec-trainings")}
      
      ${maint.total > 0 ? `
      <div class="card m-block" id="spec-maintenance" style="background: var(--bg-page); border-color: var(--accent); border-width: 2px;">
        <div class="section-title">
          <h3>Техподдержка и сервис (Premium)</h3>
          <span>защита вашего бизнеса 24/7</span>
        </div>
        <div class="m-grid" style="margin-top: 20px;">
          <div style="background: white; padding: 20px; border-radius: 12px;">
            <ul style="margin: 0; padding: 0; list-style: none; font-size: 14px; line-height: 1.8;">
              <li>✅ <b>Личный менеджер:</b> ведение вашего проекта после запуска.</li>
              <li>✅ <b>Чат в Telegram:</b> оперативная связь вашей команды с нашими экспертами.</li>
              <li>✅ <b>Горячая линия 24/7:</b> решение критических сбоев в любое время.</li>
              <li>✅ <b>Бесплатные обновления iiko:</b> поддержка системы в актуальном состоянии.</li>
            </ul>
          </div>
          <div style="background: white; padding: 20px; border-radius: 12px;">
            <p style="margin: 0 0 10px; font-weight: 800; color: var(--text-main); font-size: 15px;">Бизнес-выгоды:</p>
            <ul style="margin: 0; padding: 0; list-style: none; font-size: 14px; line-height: 1.6;">
              <li>🚀 <b>Снижаем простои и ошибки:</b> персонал не ждет помощи, а работает.</li>
              <li>⚡ <b>Стабильность в пики:</b> система выдержит любую нагрузку в час пик.</li>
            </ul>
          </div>
        </div>
        ${maintBlock}
      </div>
      ` : ''}

      <div class="totals" style="margin-top: 32px; padding-top: 24px; border-top: 2px solid var(--accent);">
         ${hasGlobalDiscounts ? `
           <div style="display:flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
              <span style="font-size: 16px; color: var(--muted); font-weight: 600;">ИТОГО БЕЗ СКИДКИ:</span>
              <span style="font-size: 18px; color: var(--muted); font-weight: 600; text-decoration: line-through;">${formatMoney(globalBaseTotal)}</span>
           </div>
           <div style="display:flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 24px; font-weight: 800; color: var(--text-main);">ИТОГО СО СКИДКОЙ:</span>
              <span style="font-size: 32px; font-weight: 900; color: #fff; background: var(--accent); padding: 8px 24px; border-radius: 14px; box-shadow: 0 4px 15px rgba(210,0,0,0.3);">${formatMoney(model.total)}</span>
           </div>
         ` : `
           <div style="display:flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 24px; font-weight: 800; color: var(--text-main);">ИТОГО:</span>
              <span style="font-size: 32px; font-weight: 900; color: #fff; background: var(--accent); padding: 8px 24px; border-radius: 14px; box-shadow: 0 4px 15px rgba(210,0,0,0.3);">${formatMoney(model.total)}</span>
           </div>
         `}
      </div>

      <div style="margin-top: 32px; padding: 16px; background: var(--accent-light); border: 1px dashed var(--accent); border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--accent);">
         <span style="font-size: 1.2em;">⏳</span>
         <span style="font-weight: 700; font-size: 1.1em;">Предложение действительно до ${validUntilStr}</span>
      </div>
    </div>

    <div class="card" style="margin-top: 24px;">
      <div class="section-title">
        <h3>Частые вопросы</h3>
        <span>FAQ</span>
      </div>
      <div class="faq">
        <div class="faq-item">
          <div class="faq-q" onclick="toggleFaq(this)">Сколько времени занимает запуск?</div>
          <div class="faq-a">Стандартный запуск занимает от 3 до 7 рабочих дней после оплаты и поставки оборудования. Мы можем ускорить процесс при наличии готовой локальной сети.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q" onclick="toggleFaq(this)">Что требуется от нас для начала работ?</div>
          <div class="faq-a">Нам понадобятся: стабильный интернет в заведении, наличие розеток в местах установки касс и утвержденное меню для первичной настройки базы данных.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q" onclick="toggleFaq(this)">Как работает техподдержка?</div>
          <div class="faq-a">Поддержка работает круглосуточно 24/7. У вас будет персональный менеджер и доступ в Telegram-чат с нашими инженерами для мгновенного решения вопросов.</div>
        </div>
        <div class="faq-item">
          <div class="faq-q" onclick="toggleFaq(this)">Можно ли начать с одной кассы и потом расшириться?</div>
          <div class="faq-a">Да, iiko легко масштабируется. Мы можем запустить проект на одном рабочем месте и добавить новые терминалы, когда ваш бизнес начнет расти.</div>
        </div>
      </div>
    </div>

    <div class="card liquid-glass" id="cta" style="margin-top: 24px; text-align: center; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.4); padding: 48px 32px; box-shadow: 0 8px 32px rgba(31, 38, 135, 0.1);">
      <div class="liquid-glare"></div>
      <h3 style="font-size: 28px; margin-bottom: 12px; color: var(--text-main); font-weight: 900; position: relative; z-index: 1;">Готовы зафиксировать дату запуска?</h3>
      <p style="color: var(--muted); margin-bottom: 32px; font-size: 17px; max-width: 500px; margin-left: auto; margin-right: auto; position: relative; z-index: 1;">Процесс запуска максимально прост и прозрачен:</p>

      <div class="steps" style="margin-bottom: 40px; text-align: left;">
        <div class="step">
          <b>Шаг 1: Подтверждение</b>
          <div class="muted">Напишите нам формат заведения, количество касс и желаемые сроки открытия.</div>
        </div>
        <div class="step">
          <b>Шаг 2: Финализация</b>
          <div class="muted">Мы подтвердим состав оборудования, финальную смету и забронируем инженеров на ваши даты.</div>
        </div>
      </div>

      <div class="cta-actions">
        ${tgLink ? `<a class="btn primary cta-btn tg-solid" href="${tgLink}"><span>💬</span> Написать в Telegram</a>` : ""}
        ${manager.phone ? `<a class="btn primary cta-btn" href="tel:${phoneTel}"><span>📞</span> Позвонить менеджеру</a>` : ""}
        <a class="btn secondary cta-btn" href="mailto:${manager.email || "info@standartmaster.ru"}"><span>✉️</span> Написать на Email</a>
      </div>

      <p class="note" style="text-align: center; margin-top: 24px; opacity: 0.6; font-size: 13px;">* Мы работаем по договору с гарантией результата.</p>
      <div style="margin-top: 16px; font-size: 14px; color: var(--muted); text-align: center;">
        Ваш персональный менеджер: <b>${manager.name}</b> · Стандарт Мастер
      </div>
    </div>

    <div class="scarcity-banner" id="scarcity-banner">
      <div class="scarcity-close" id="scarcity-close">✕</div>
      <h4>🔥 Предложение ограничено по времени!</h4>
      <p>Не затягивайте с принятием решения. До завершения акции осталось:</p>
      <div class="scarcity-timer">
        <div class="timer-unit"><div class="timer-val" id="t-days">00</div><div class="timer-label">Дней</div></div>
        <div class="timer-unit"><div class="timer-val" id="t-hours">00</div><div class="timer-label">Час</div></div>
        <div class="timer-unit"><div class="timer-val" id="t-mins">00</div><div class="timer-label">Мин</div></div>
        <div class="timer-unit"><div class="timer-val" id="t-secs">00</div><div class="timer-label">Сек</div></div>
      </div>
    </div>
  </div> <!-- Close .wrap -->

  <!-- Fixed Elements - Outside .wrap for proper position:fixed -->
  <div class="back-to-top" id="back-to-top" onclick="scrollToTop()">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  </div>

  <!-- Mobile Fixed Footers -->
  <a class="mobile-footer-breakdown" id="mobile-footer-breakdown" href="#brief-summary" style="text-decoration: none !important;">
      <div class="breakdown-item">
        <span>Разово:</span>
        <div>
          <b style="${onceBase > onceActual ? 'color: var(--accent);' : ''}">${formatMoney(onceActual)}</b>
          ${onceBase > onceActual ? `<div class="muted" style="text-decoration:line-through; font-size:9px; margin-top:-2px;">${formatMoney(onceBase)}</div>` : ''}
        </div>
      </div>
      <div class="breakdown-item">
        <span>1-${maint.months} мес:</span>
        <div>
          <b style="${licensesBase > licensesActual ? 'color: var(--accent);' : ''}">${formatMoney(licensesActual)}/м</b>
          ${licensesBase > licensesActual ? `<div class="muted" style="text-decoration:line-through; font-size:9px; margin-top:-2px;">${formatMoney(licensesBase)}/м</div>` : ''}
        </div>
      </div>
      <div class="breakdown-item">
        <span>С ${maint.months + 1}-го мес:</span>
        <div>
          <b style="${futureBase > futureActual ? 'color: var(--accent);' : ''}">${formatMoney(futureActual)}/м</b>
          ${futureBase > futureActual ? `<div class="muted" style="text-decoration:line-through; font-size:9px; margin-top:-2px;">${formatMoney(futureBase)}/м</div>` : ''}
        </div>
      </div>
    </a>

    <div class="mobile-price-footer" id="mobile-price-footer">
      <div class="footer-price">
        <span>Краткий итог:</span>
        <b style="color: var(--accent);">${formatMoney(model.total)}</b>
        ${hasGlobalDiscounts ? `<div class="muted" style="text-decoration:line-through; font-size:10px; font-weight:normal; margin-top: -2px;">${formatMoney(globalBaseTotal)}</div>` : ''}
      </div>
      <a href="#cta" class="footer-btn">Запустить</a>
  </div>

  <script id="kp-data-b64" type="application/json">${base64Data}</script>
  ${expirationScript}
</body>
</html>`;
}

/**
 * Parses KP model from the embedded script tag.
 */
export function parseKpHtmlNew(htmlString) {
  const match = htmlString.match(
    /<script id="kp-data-b64" type="application\/json">([^<]+)<\/script>/,
  );
  if (!match || !match[1]) return null;
  try {
    const json = decodeURIComponent(escape(atob(match[1])));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}
