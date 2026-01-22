import { getKpTaxConfig, getKpDiscountsConfig, getDiscountPercentForQty, getKpDefaults } from "../config/kpConfig.js";

/**
 * Calculates line totals and applies discounts/taxes.
 * Pure logic, no side effects.
 */

export function createEmptyKpModel({ crmId, manager }) {
    return {
        meta: {
            crmId,
            kpFilename: null,
            createdAt: new Date().toISOString(),
            validDays: getKpDefaults().validDays,
            manager: {
                id: manager.id,
                name: manager.fullName,
                post: manager.position,
                phone: manager.phone,
                email: manager.email,
                tg: manager.tg || "",
                avatar: manager.avatar || null // Preview URL, will be replaced by base64 in save flow
            },
            client: {
                name: "",
                juridicalName: "",
                inn: ""
            }
        },
        sections: {
            services: { items: [], discountPercent: 0, subtotal: 0, total: 0 },
            equipment: { items: [], discountPercent: 0, subtotal: 0, total: 0 },
            licenses: { items: [], discountPercent: 0, subtotal: 0, total: 0 },
            trainings: { items: [], discountPercent: 0, subtotal: 0, total: 0 },
            consumables: { items: [], discountPercent: 0, subtotal: 0, total: 0 },
            maintenance: { terminals: 0, unitPrice: 0, basePrice: 0, discountPercent: 0, subtotal: 0, total: 0, months: getKpDefaults().maintenanceMonths }
        },
        total: 0
    };
}

export function recalcKpModel(model) {
    // Clone to avoid mutation if needed, or structuredClone.
    // For performance in vanilla JS, shallow copies of sections is usually enough 
    // but here we modify in place or return new object. Let's return a safe update.
    const taxConfig = getKpTaxConfig();
    const rate = taxConfig.rate || 20;

    const sections = { ...model.sections };
    let grandTotal = 0;

    const calcSection = (sectionKey, { useLineDiscounts = false, manualLineDiscounts = false } = {}) => {
        const section = sections[sectionKey];
        let subtotal = 0;
        let total = 0;

        const items = section.items.map(item => {
            const price = Number(item.price) || 0;
            const qty = Number(item.qty) || 0;
            const lineSubtotal = price * qty;
            let discountPercent = 0;
            
            if (item.discountMode === 'manual' || manualLineDiscounts) {
                discountPercent = Number(item.discountPercent) || 0;
            } else if (item.discountMode === 'auto' || useLineDiscounts) {
                discountPercent = getDiscountPercentForQty(qty);
            } else if (item.discountMode === 'fixed') {
                discountPercent = 0;
            } else {
                discountPercent = Number(section.discountPercent) || 0;
            }

            const discountAmount = lineSubtotal * (discountPercent / 100);
            const lineTotal = lineSubtotal - discountAmount;
            subtotal += lineSubtotal;
            total += lineTotal;
            return {
                ...item,
                subtotal: lineSubtotal,
                discountPercent,
                discountAmount,
                total: lineTotal,
            };
        });

        subtotal = Math.round(subtotal * 100) / 100;
        total = Math.round(total * 100) / 100;

        sections[sectionKey] = {
            ...section,
            discountPercent: (useLineDiscounts || manualLineDiscounts) ? 0 : section.discountPercent,
            items,
            subtotal,
            total,
        };
        grandTotal += total;
    };

    calcSection("services", { useLineDiscounts: true });
    calcSection("equipment", { manualLineDiscounts: true });
    calcSection("licenses", { manualLineDiscounts: true });
    calcSection("trainings", { manualLineDiscounts: true });
    calcSection("consumables", { manualLineDiscounts: true });

    // Maintenance (detailed calculation)
    const maint = sections.maintenance;
    const terminals = Number(maint.terminals) || 0;
    const unitPrice = Number(maint.unitPrice) || 0;
    const baseUnitPrice = Number(maint.basePrice) || unitPrice;
    
    const months = Number(maint.months) || 1;
    const maintSubtotal = baseUnitPrice * terminals * months;
    const maintMonthlyTotal = unitPrice * terminals;
    const maintTotal = maintMonthlyTotal * months;
    const maintDiscountAmount = maintSubtotal - maintTotal;
    const maintDiscountPercent = maintSubtotal > 0 ? (maintDiscountAmount / maintSubtotal) * 100 : 0;

    sections.maintenance = { 
        ...maint, 
        subtotal: Math.round(maintSubtotal * 100) / 100, 
        total: Math.round(maintTotal * 100) / 100,
        discountAmount: Math.round(maintDiscountAmount * 100) / 100,
        discountPercent: Math.round(maintDiscountPercent * 10) / 10,
        unitPrice: Math.round(unitPrice * 100) / 100,
        basePrice: Math.round(baseUnitPrice * 100) / 100
    };
    grandTotal += sections.maintenance.total;

    // Tax Calculation
    // Assuming prices are tax-inclusive by default if not specified otherwise
    // We just calculate the tax share for display
    const taxIncluded = taxConfig.included !== false; // default true
    let taxTotal = 0;
    let netTotal = 0;

    if (taxIncluded) {
        // GrandTotal is Gross
        // Tax = Gross - (Gross / (1 + rate/100))
        netTotal = grandTotal / (1 + rate / 100);
        taxTotal = grandTotal - netTotal;
    } else {
        // GrandTotal is Net
        netTotal = grandTotal;
        taxTotal = grandTotal * (rate / 100);
        grandTotal = netTotal + taxTotal;
    }

    // Rounding
    taxTotal = Math.round(taxTotal * 100) / 100;
    netTotal = Math.round(netTotal * 100) / 100;
    grandTotal = Math.round(grandTotal * 100) / 100;

    return {
        ...model,
        sections,
        total: grandTotal,
        tax: {
            rate,
            amount: taxTotal,
            net: netTotal,
            included: taxIncluded
        }
    };
}

export function formatMoney(amount) {
    return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}
