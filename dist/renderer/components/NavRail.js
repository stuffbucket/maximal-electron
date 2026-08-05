import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
export function NavRail({ sections, current, onSelect, collapsed, icon, label = 'Primary', testId = 'left-nav', }) {
    // Unset means open. Seeding this with every section id would say the same
    // thing at more length, and would go stale when a section is added.
    const [open, setOpen] = useState({});
    return (_jsx("nav", { className: `nav${collapsed ? ' nav--collapsed' : ''}`, "aria-label": label, "data-testid": testId, children: sections.map((section) => (_jsxs(Collapsible.Root, { className: "nav__section", open: collapsed ? true : (open[section.id] ?? true), onOpenChange: (next) => setOpen((prev) => ({ ...prev, [section.id]: next })), children: [!collapsed && (_jsxs(Collapsible.Trigger, { className: "nav__heading", children: [_jsx(ChevronDown, { className: "nav__chevron", size: 12 }), _jsx("span", { children: section.label })] })), _jsx(Collapsible.Content, { children: section.items.map((entry) => {
                        const Icon = icon(entry);
                        return (_jsxs("button", { type: "button", className: "nav__item", "aria-current": entry.id === current, "data-status": entry.status, onClick: () => onSelect(entry.id), title: collapsed ? entry.label : undefined, "data-testid": `nav-${entry.id.replace(':', '-')}`, children: [_jsx(Icon, { size: 16 }), _jsx("span", { className: "nav__label", children: entry.label }), entry.count > 0 && (_jsx("span", { className: "nav__item-count", children: entry.count }))] }, entry.id));
                    }) })] }, section.id))) }));
}
