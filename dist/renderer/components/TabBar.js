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
    const activeIndex = tabs.findIndex((tab) => tab.id === active);
    const activeItem = tabs[activeIndex];
    // Closing the last tab is refused, so every close affordance hangs off this
    // rather than repeating the condition.
    const closeTab = tabs.length > 1 ? onClose : undefined;
    /*
     * Which trigger to focus once the caller has dropped a tab.
     *
     * Closing unmounts the element that held focus, and focus then falls to the
     * document body, which costs the user the strip's single tab stop. The
     * neighbour is chosen before the close and claimed after the list changes,
     * because the neighbour cannot be identified once the tab is gone.
     */
    const focusAfterClose = useRef(null);
    useEffect(() => {
        const id = focusAfterClose.current;
        if (id === null)
            return;
        focusAfterClose.current = null;
        document.getElementById(getTabTriggerId(tabIdBase, id))?.focus();
    }, [tabs, tabIdBase]);
    /*
     * Only for a close the keyboard started. A pointer close leaves focus where
     * it was, because the pointer never took it: the marker cancels its own
     * `pointerdown`, and pulling focus into the strip would take it from
     * whatever the closed tab was sitting beside, such as a live terminal.
     */
    const closeAndRefocus = (index) => {
        const tab = tabs[index];
        if (!closeTab || !tab)
            return;
        focusAfterClose.current = (tabs[index + 1] ?? tabs[index - 1])?.id ?? null;
        closeTab(tab.id);
    };
    return (_jsxs(Tabs.Root, { value: active, onValueChange: onSelect, className: "tabs", activationMode: "manual", children: [_jsx(Tabs.List, { className: "tabbar", "aria-label": label, children: tabs.map((tab, index) => {
                    const Icon = icon?.(tab);
                    return (_jsxs(Tabs.Trigger, { value: tab.id, className: "tab", id: getTabTriggerId(tabIdBase, tab.id), "aria-controls": tab.id === active ? getTabPanelId(tabIdBase, tab.id) : undefined, "aria-keyshortcuts": closeTab ? 'Delete' : undefined, onKeyDown: (event) => {
                            if (!closeTab)
                                return;
                            // The key macOS prints as "delete" sends Backspace, so both
                            // close. Neither has a default action worth keeping on a tab.
                            if (event.key !== 'Delete' && event.key !== 'Backspace')
                                return;
                            event.preventDefault();
                            closeAndRefocus(index);
                        }, children: [Icon && _jsx(Icon, { size: 13 }), tab.status && _jsx("span", { className: "dot", "data-status": tab.status }), _jsx(TabLabel, { title: tab.title }), closeTab && (_jsx("span", { "aria-hidden": "true", className: "tab__close", onPointerDown: (event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                    closeTab(tab.id);
                                }, children: _jsx(X, { size: 12 }) }))] }, tab.id));
                }) }), closeTab && activeItem && (_jsx("button", { type: "button", className: "tab__close-keyboard", "aria-label": `Close ${activeItem.title}`, onClick: () => closeAndRefocus(activeIndex), children: _jsx(X, { size: 12 }) })), onNew && (_jsx("button", { type: "button", className: "tab__new", onClick: onNew, "aria-label": newLabel, "data-testid": "tab-new", children: _jsx(Plus, { size: 14 }) }))] }));
}
