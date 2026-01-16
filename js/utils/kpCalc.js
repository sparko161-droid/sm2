
import { getKpTaxConfig, getKpDiscountsConfig } from "../config.js";

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
            validDays: 10,
            manager: {
                id: manager.id,
                name: manager.fullName,
                post: manager.position,
                phone: manager.phone,
                email: manager.email,
                avatar: null // Will be populated in save flow
            }
        },
        sections: {
            services: { items: [], discountPercent: 0, subtotal: 0, total: 0 },
            equipment: { items: [], discountPercent: 0, subtotal: 0, total: 0 },
            licenses: { items: [], discountPercent: 0, subtotal: 0, total: 0 },
            maintenance: { terminals: 0, unitPrice: 0, subtotal: 0, total: 0 }
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
    const discounts = getKpDiscountsConfig();

    const resolveDiscountByQty = (qty, rules = []) => {
        const amount = Number(qty) || 0;
        const rule = rules.find((r) => {
            const min = Number(r.min ?? 0);
            const max = r.max == null ? Infinity : Number(r.max);
            return amount >= min && amount <= max;
        });
        return rule ? Number(rule.percent) || 0 : 0;
    };

    const calcSection = (sectionKey, { useLineDiscounts = false } = {}) => {
        const section = sections[sectionKey];
        let subtotal = 0;
        let total = 0;

        const items = section.items.map(item => {
            const price = Number(item.price) || 0;
            const qty = Number(item.qty) || 0;
            const lineSubtotal = price * qty;
            const discountPercent = useLineDiscounts
                ? resolveDiscountByQty(qty, discounts.servicesByQty || [])
                : Number(section.discountPercent) || 0;
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
            discountPercent: useLineDiscounts ? 0 : section.discountPercent,
            items,
            subtotal,
            total,
        };
        grandTotal += total;
    };

    calcSection("services", { useLineDiscounts: true });
    calcSection("equipment");
    calcSection("licenses");

    // Maintenance (special case)
    const maint = sections.maintenance;
    const maintSubtotal = (maint.unitPrice || 0) * (maint.terminals || 0);
    const maintTotal = Math.round(maintSubtotal * 100) / 100;
    sections.maintenance = { ...maint, subtotal: maintSubtotal, total: maintTotal };
    grandTotal += maintTotal;

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
