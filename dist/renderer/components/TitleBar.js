import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { TabBar } from './TabBar.js';
/**
 * A draggable title bar that hosts document tabs and caller-owned controls.
 *
 * The leading and actions slots deliberately know nothing about Electron IPC or
 * product features. Their wrappers opt every injected control out of the drag
 * region, including links and custom interactive elements.
 */
export function TitleBar({ leading, actions, tabIdBase, tabs, activeTab, onSelectTab, onCloseTab, onNewTab, tabsLabel, newTabLabel, tabIcon, }) {
    const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
    return (_jsxs("header", { className: "titlebar", "data-testid": "titlebar", children: [isMac && _jsx("span", { className: "titlebar__spacer-mac" }), leading !== undefined && (_jsx("div", { className: "titlebar__leading", children: leading })), _jsx(TabBar, { tabIdBase: tabIdBase, tabs: tabs, active: activeTab, onSelect: onSelectTab, onClose: onCloseTab, onNew: onNewTab, label: tabsLabel, newLabel: newTabLabel, icon: tabIcon }), _jsx("span", { className: "titlebar__grow" }), actions !== undefined && (_jsx("div", { className: "titlebar__actions", children: actions })), !isMac && _jsx("span", { className: "titlebar__spacer-win" })] }));
}
