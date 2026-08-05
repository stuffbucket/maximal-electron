import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as Tabs from '@radix-ui/react-tabs';
import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
function safeIdPart(value) {
    return encodeURIComponent(value);
}
/** The ID applied to a tab trigger for a consumer-rendered panel. */
export function getTabTriggerId(tabIdBase, tabId) {
    return `${tabIdBase}-tab-${safeIdPart(tabId)}`;
}
/** The ID applied to the panel controlled by a tab trigger. */
export function getTabPanelId(tabIdBase, tabId) {
    return `${tabIdBase}-tabpanel-${safeIdPart(tabId)}`;
}
/**
 * A tab strip built on Radix `Tabs`, which owns keyboard navigation and roving
 * focus. Stable public IDs connect each trigger to caller-rendered content.
 *
 * This renders the strip only. The caller renders the active document with the
 * ID from `getTabPanelId` and labels it with `getTabTriggerId`.
 */
/**
 * Whether a label is wider than the room it has.
 *
 * The fade has to be measured, not assumed. A mask applied unconditionally
 * fades any text that happens to end near the right edge, so `Terminal 1`
 * rendered as `Terminal` in a tab with room to spare — the mask cannot tell
 * "reaches the edge" from "overflows it".
 *
 * Re-measured on resize, because a tab shrinks as the strip fills.
 */
function useTruncated() {
    const [truncated, setTruncated] = useState(false);
    const node = useRef(null);
    const measure = useCallback(() => {
        const element = node.current;
        if (element)
            setTruncated(element.scrollWidth > element.clientWidth);
    }, []);
    const ref = useCallback((element) => {
        node.current = element;
        measure();
    }, [measure]);
    useEffect(() => {
        if (typeof ResizeObserver === 'undefined')
            return;
        const element = node.current;
        if (!element)
            return;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [measure]);
    return [ref, truncated];
}
/** One tab's label, faded only when it does not fit. */
function TabLabel({ title }) {
    const [ref, truncated] = useTruncated();
    return (_jsx("span", { className: "tab__label", ref: ref, "data-truncated": truncated || undefined, children: title }));
}
export function TabBar({ tabIdBase, tabs, active, onSelect, onClose, onNew, icon, label = 'Open documents', newLabel = 'New tab', }) {
    const activeItem = tabs.find((tab) => tab.id === active);
    return (_jsxs(Tabs.Root, { value: active, onValueChange: onSelect, className: "tabs", activationMode: "manual", children: [_jsx(Tabs.List, { className: "tabbar", "aria-label": label, children: tabs.map((tab) => {
                    const Icon = icon?.(tab);
                    return (_jsxs(Tabs.Trigger, { value: tab.id, className: "tab", id: getTabTriggerId(tabIdBase, tab.id), "aria-controls": getTabPanelId(tabIdBase, tab.id), children: [Icon && _jsx(Icon, { size: 13 }), tab.status && _jsx("span", { className: "dot", "data-status": tab.status }), _jsx(TabLabel, { title: tab.title }), onClose && tabs.length > 1 && (_jsx("span", { "aria-hidden": "true", className: "tab__close", onPointerDown: (event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                    onClose(tab.id);
                                }, children: _jsx(X, { size: 12 }) }))] }, tab.id));
                }) }), onClose && tabs.length > 1 && activeItem && (_jsx("button", { type: "button", className: "tab__close-keyboard", "aria-label": `Close ${activeItem.title}`, onClick: () => onClose(activeItem.id), children: _jsx(X, { size: 12 }) })), onNew && (_jsx("button", { type: "button", className: "tab__new", onClick: onNew, "aria-label": newLabel, "data-testid": "tab-new", children: _jsx(Plus, { size: 14 }) }))] }));
}
