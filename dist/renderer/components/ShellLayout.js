import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import * as Tooltip from '@radix-ui/react-tooltip';
import { PanelLeft, PanelRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout, usePanelRef, } from 'react-resizable-panels';
import { IconButton } from './controls/Button.js';
import { TitleBar } from './TitleBar.js';
import { getTabPanelId, getTabTriggerId, } from './TabBar.js';
/*
 * Pixels for the rail, percentages for the rest.
 *
 * A rail holds fixed-size icons and a label, so what it needs does not change
 * with the window. As a percentage the collapsed rail grew from 51px at 1280
 * to 67px around 16px icons, and the width at which it snapped shut moved with
 * the window too — which is most of why the collapse felt like it resisted.
 */
const LEFT = {
    default: '228px',
    min: '168px',
    max: '320px',
    collapsed: '48px',
};
const RIGHT = { default: '22', min: '16', max: '36', collapsed: '0' };
const BOTTOM = { default: '30', min: '10', max: '70', collapsed: '0' };
export function ShellLayout({ layoutId, tabs, activeTab, onSelectTab, onCloseTab, onNewTab, tabsLabel, newTabLabel, tabIcon, titleBarLeading, titleBarActions, subscribeToPanelToggles, top, left, main, bottom, right, status, leftSize = LEFT, rightSize = RIGHT, bottomSize = BOTTOM, }) {
    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);
    const tabIdBase = `${layoutId}-documents`;
    const leftPanel = usePanelRef();
    const rightPanel = usePanelRef();
    const bottomPanel = usePanelRef();
    // Persists panel sizes to `localStorage`, so a reload restores the layout
    // with no storage code here.
    const layout = useDefaultLayout({
        id: layoutId,
        panelIds: ['left', 'main', 'right'],
    });
    // A second, independent layout for the centre column's split. Only created
    // when there is something to split.
    const columnLayout = useDefaultLayout({
        id: `${layoutId}-column`,
        panelIds: ['main', 'bottom'],
    });
    const togglePanel = useCallback((panel) => {
        const handle = panel === 'left' ? leftPanel.current : rightPanel.current;
        if (!handle)
            return;
        if (handle.isCollapsed())
            handle.expand();
        else
            handle.collapse();
    }, [leftPanel, rightPanel]);
    useEffect(() => {
        if (!subscribeToPanelToggles)
            return;
        return subscribeToPanelToggles(togglePanel);
    }, [subscribeToPanelToggles, togglePanel]);
    const documentPanel = (_jsx("div", { className: "tabpanel", role: "tabpanel", id: getTabPanelId(tabIdBase, activeTab), "aria-labelledby": getTabTriggerId(tabIdBase, activeTab), tabIndex: 0, children: main }));
    return (_jsx(Tooltip.Provider, { delayDuration: 400, children: _jsxs("div", { className: "sb-shell app", children: [_jsx(TitleBar, { tabIdBase: tabIdBase, leading: _jsxs(_Fragment, { children: [titleBarLeading, _jsx(IconButton, { label: leftCollapsed ? 'Show sidebar' : 'Hide sidebar', onClick: () => togglePanel('left'), active: !leftCollapsed, testId: "toggle-left", children: _jsx(PanelLeft, { size: 15 }) })] }), actions: _jsxs(_Fragment, { children: [titleBarActions, _jsx(IconButton, { label: rightCollapsed ? 'Show panel' : 'Hide panel', onClick: () => togglePanel('right'), active: !rightCollapsed, testId: "toggle-right", children: _jsx(PanelRight, { size: 15 }) })] }), tabs: tabs, activeTab: activeTab, onSelectTab: onSelectTab, onCloseTab: onCloseTab, onNewTab: onNewTab, tabsLabel: tabsLabel, newTabLabel: newTabLabel, tabIcon: tabIcon }), top, _jsxs(Group, { orientation: "horizontal", className: "panels", defaultLayout: layout.defaultLayout, onLayoutChanged: layout.onLayoutChanged, children: [_jsx(Panel, { id: "left", panelRef: leftPanel, defaultSize: leftSize.default, minSize: leftSize.min, maxSize: leftSize.max, collapsible: true, collapsedSize: leftSize.collapsed, onResize: () => setLeftCollapsed(leftPanel.current?.isCollapsed() ?? false), className: "panel", children: left(leftCollapsed) }), _jsx(Separator, { className: "resize-handle" }), _jsxs(Panel, { id: "main", minSize: "30", className: "panel panel--canvas", children: [bottom === undefined ? (documentPanel) : (_jsxs(Group, { orientation: "vertical", className: "column", defaultLayout: columnLayout.defaultLayout, onLayoutChanged: columnLayout.onLayoutChanged, children: [_jsx(Panel, { id: "main", minSize: "20", className: "panel panel--canvas", children: documentPanel }), _jsx(Separator, { className: "resize-handle resize-handle--horizontal" }), _jsx(Panel, { id: "bottom", panelRef: bottomPanel, defaultSize: bottomSize.default, minSize: bottomSize.min, maxSize: bottomSize.max, collapsible: true, collapsedSize: bottomSize.collapsed, className: "panel panel--drawer", children: bottom })] })), _jsxs("footer", { className: "statusbar", children: [status, _jsx("span", { className: "statusbar__grow" })] })] }), _jsx(Separator, { className: "resize-handle" }), _jsx(Panel, { id: "right", panelRef: rightPanel, defaultSize: rightSize.default, minSize: rightSize.min, maxSize: rightSize.max, collapsible: true, collapsedSize: rightSize.collapsed, onResize: () => setRightCollapsed(rightPanel.current?.isCollapsed() ?? false), className: "panel", children: right })] })] }) }));
}
