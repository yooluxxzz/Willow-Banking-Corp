/* ═══════════════════════════════════════════════════════════════════════
   Willow charts — dependency-free, accessible SVG charts.
   line()      price/time series with crosshair, tooltip and keyboard control
   sparkline() compact trend line
   donut()     allocation ring with legend
   bars()      horizontal ranked bars (HTML)
   columns()   grouped vertical columns (cash flow)
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

(function (global) {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const palette = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'];
    let uid = 0;

    const reducedMotion = () => Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const svg = (tag, attrs = {}) => {
        const node = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs).forEach(([key, value]) => { if (value !== undefined && value !== null) node.setAttribute(key, value); });
        return node;
    };
    const money = (value, currency) => (global.Willow ? global.Willow.formatMoney(value, currency || 'USD') : Number(value).toFixed(2));
    const toDate = value => (value instanceof Date ? value : new Date(value));

    function niceTicks(min, max, count = 4) {
        const span = max - min || Math.abs(max) || 1;
        const rough = span / count;
        const power = Math.pow(10, Math.floor(Math.log10(rough)));
        const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= rough) || rough;
        const start = Math.ceil(min / step) * step;
        const ticks = [];
        for (let value = start; value <= max + step * 0.001; value += step) ticks.push(Number(value.toFixed(10)));
        return ticks;
    }

    function formatAxisValue(value, currency) {
        const abs = Math.abs(value);
        if (currency && abs >= 1000) return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value);
        if (currency) return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: abs < 10 ? 2 : 0 }).format(value);
        return new Intl.NumberFormat('en-US', { notation: abs >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 2 }).format(value);
    }

    function timeFormatter(range, points) {
        const first = points.length ? toDate(points[0].t) : new Date();
        const last = points.length ? toDate(points[points.length - 1].t) : new Date();
        const spanDays = (last - first) / 86400000;
        if (range === '1d' || spanDays < 1.5) return { axis: d => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d), tip: d => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d) };
        if (range === '1w' || spanDays < 10) return { axis: d => new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric' }).format(d), tip: d => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d) };
        if (spanDays < 400) return { axis: d => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d), tip: d => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d) };
        return { axis: d => new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(d), tip: d => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d) };
    }

    function observeResize(container, render) {
        if (container.__willowResize) container.__willowResize.disconnect();
        if (!('ResizeObserver' in global)) return;
        let lastWidth = container.clientWidth;
        let frame = null;
        const observer = new ResizeObserver(() => {
            const width = container.clientWidth;
            if (Math.abs(width - lastWidth) < 4) return;
            lastWidth = width;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => render(false));
        });
        observer.observe(container);
        container.__willowResize = observer;
    }

    /**
     * Line/area chart.
     * points: [{ t: Date|string|number, v: number }]
     * options: { currency, height, baseline, tone: 'auto'|'up'|'down'|'brand', range, label, onHover, animate, compact }
     */
    function line(container, points, options = {}) {
        const data = (points || []).map(point => ({ t: toDate(point.t), v: Number(point.v) })).filter(point => Number.isFinite(point.v) && !Number.isNaN(point.t.getTime()));
        container.replaceChildren();
        container.classList.add('chart');
        if (data.length < 2) {
            container.classList.remove('is-up', 'is-down', 'is-brand');
            return null;
        }
        const id = `wc${++uid}`;
        const first = data[0].v;
        const last = data[data.length - 1].v;
        const reference = Number.isFinite(options.baseline) ? options.baseline : first;
        const tone = options.tone && options.tone !== 'auto' ? options.tone : (last >= reference ? 'up' : 'down');
        container.classList.remove('is-up', 'is-down', 'is-brand');
        container.classList.add(`is-${tone}`);
        const formats = timeFormatter(options.range, data);
        const values = data.map(point => point.v);
        const min = Math.min(...values, Number.isFinite(options.baseline) ? options.baseline : Infinity);
        const max = Math.max(...values, Number.isFinite(options.baseline) ? options.baseline : -Infinity);
        const label = options.label || 'Price history';
        const summary = `${label}. ${data.length} points from ${formats.tip(data[0].t)} to ${formats.tip(data[data.length - 1].t)}. Started at ${money(first, options.currency)}, ended at ${money(last, options.currency)}. High ${money(Math.max(...values), options.currency)}, low ${money(Math.min(...values), options.currency)}.`;

        const live = document.createElement('p');
        live.className = 'visually-hidden';
        live.setAttribute('aria-live', 'polite');

        const tooltip = document.createElement('div');
        tooltip.className = 'chart-tooltip';
        tooltip.setAttribute('aria-hidden', 'true');

        const state = { index: null };

        function render(animate) {
            container.querySelectorAll('svg').forEach(node => node.remove());
            const width = Math.max(260, container.clientWidth || 600);
            const height = options.height || (options.compact ? 160 : 280);
            const pad = options.compact ? { top: 10, right: 8, bottom: 10, left: 8 } : { top: 16, right: 58, bottom: 30, left: 6 };
            const span = (max - min) || Math.abs(max) * 0.02 || 1;
            const lo = min - span * 0.08;
            const hi = max + span * 0.08;
            const x = index => pad.left + (index / (data.length - 1)) * (width - pad.left - pad.right);
            const y = value => pad.top + (1 - (value - lo) / (hi - lo)) * (height - pad.top - pad.bottom);

            const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': summary, preserveAspectRatio: 'none' });
            const defs = svg('defs');
            const gradient = svg('linearGradient', { id: `${id}-fill`, x1: 0, y1: 0, x2: 0, y2: 1 });
            const toneVar = tone === 'brand' ? 'var(--chart-1)' : tone === 'up' ? 'var(--positive)' : 'var(--negative)';
            const stopTop = svg('stop', { offset: '0%' });
            stopTop.setAttribute('style', `stop-color:${toneVar};stop-opacity:0.22`);
            const stopBottom = svg('stop', { offset: '100%' });
            stopBottom.setAttribute('style', `stop-color:${toneVar};stop-opacity:0`);
            gradient.append(stopTop, stopBottom);
            defs.append(gradient);
            root.append(defs);

            if (!options.compact) {
                const grid = svg('g', { class: 'chart-grid' });
                const axis = svg('g', { class: 'chart-axis' });
                niceTicks(lo, hi, 4).forEach(tick => {
                    const ty = y(tick);
                    if (ty < pad.top - 2 || ty > height - pad.bottom + 2) return;
                    grid.append(svg('line', { x1: pad.left, x2: width - pad.right, y1: ty, y2: ty }));
                    const text = svg('text', { x: width - pad.right + 10, y: ty + 4 });
                    text.textContent = formatAxisValue(tick, options.currency);
                    axis.append(text);
                });
                const labelCount = width < 420 ? 3 : 5;
                for (let i = 0; i < labelCount; i++) {
                    const index = Math.round((i / (labelCount - 1)) * (data.length - 1));
                    const text = svg('text', { x: x(index), y: height - 8, 'text-anchor': i === 0 ? 'start' : i === labelCount - 1 ? 'end' : 'middle' });
                    text.textContent = formats.axis(data[index].t);
                    axis.append(text);
                }
                root.append(grid, axis);
            }
            if (Number.isFinite(options.baseline)) {
                const by = y(options.baseline);
                root.append(svg('line', { class: 'chart-baseline', x1: pad.left, x2: width - pad.right, y1: by, y2: by }));
            }
            let d = '';
            data.forEach((point, index) => { d += `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(point.v).toFixed(2)}`; });
            const area = svg('path', { class: 'chart-area', d: `${d}L${x(data.length - 1).toFixed(2)},${height - pad.bottom}L${x(0).toFixed(2)},${height - pad.bottom}Z`, fill: `url(#${id}-fill)` });
            area.style.opacity = '1';
            area.style.fill = `url(#${id}-fill)`;
            const path = svg('path', { class: 'chart-line', d });
            root.append(area, path);

            const crosshair = svg('line', { class: 'chart-crosshair', y1: pad.top, y2: height - pad.bottom, visibility: 'hidden' });
            const dot = svg('circle', { class: 'chart-dot', r: 5, visibility: 'hidden' });
            const overlay = svg('rect', { x: 0, y: 0, width, height, fill: 'transparent' });
            root.append(crosshair, dot, overlay);
            container.prepend(root);

            if (animate && options.animate !== false && !reducedMotion() && typeof path.getTotalLength === 'function') {
                const length = path.getTotalLength();
                container.style.setProperty('--len', String(Math.ceil(length)));
                container.classList.remove('chart-draw');
                void container.offsetWidth;
                container.classList.add('chart-draw');
                setTimeout(() => container.classList.remove('chart-draw'), 1300);
            }

            const show = index => {
                if (index === null) {
                    crosshair.setAttribute('visibility', 'hidden');
                    dot.setAttribute('visibility', 'hidden');
                    container.classList.remove('is-hovering');
                    state.index = null;
                    if (options.onHover) options.onHover(null);
                    return;
                }
                state.index = index;
                const point = data[index];
                const px = x(index);
                const py = y(point.v);
                crosshair.setAttribute('x1', px);
                crosshair.setAttribute('x2', px);
                crosshair.setAttribute('visibility', 'visible');
                dot.setAttribute('cx', px);
                dot.setAttribute('cy', py);
                dot.setAttribute('visibility', 'visible');
                tooltip.innerHTML = '';
                const strong = document.createElement('strong');
                strong.textContent = money(point.v, options.currency);
                const when = document.createElement('span');
                when.textContent = formats.tip(point.t);
                tooltip.append(strong, when);
                container.classList.add('is-hovering');
                const box = container.getBoundingClientRect();
                const scale = box.width / width;
                const tipWidth = tooltip.offsetWidth || 120;
                let left = px * scale - tipWidth / 2;
                left = Math.max(0, Math.min(left, box.width - tipWidth));
                tooltip.style.transform = `translate(${left}px, ${Math.max(0, py * (box.height / height) - 64)}px)`;
                if (options.onHover) options.onHover(point, index);
            };
            const indexFromEvent = event => {
                const box = root.getBoundingClientRect();
                const relative = (event.clientX - box.left) / box.width * width;
                const ratio = (relative - pad.left) / (width - pad.left - pad.right);
                return Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1))));
            };
            overlay.addEventListener('pointermove', event => show(indexFromEvent(event)));
            overlay.addEventListener('pointerdown', event => show(indexFromEvent(event)));
            overlay.addEventListener('pointerleave', () => show(null));
            container.__willowShow = show;
        }

        container.append(tooltip, live);
        if (!options.compact) {
            container.tabIndex = 0;
            container.setAttribute('aria-label', `${label}. Use left and right arrow keys to explore values.`);
            container.onkeydown = event => {
                const lastIndex = data.length - 1;
                let next = state.index;
                if (event.key === 'ArrowRight') next = next === null ? lastIndex : Math.min(lastIndex, next + Math.max(1, Math.round(data.length / 60)));
                else if (event.key === 'ArrowLeft') next = next === null ? lastIndex : Math.max(0, next - Math.max(1, Math.round(data.length / 60)));
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = lastIndex;
                else if (event.key === 'Escape') next = null;
                else return;
                event.preventDefault();
                container.__willowShow(next);
                if (next !== null) live.textContent = `${formats.tip(data[next].t)}: ${money(data[next].v, options.currency)}`;
            };
            container.onblur = () => container.__willowShow && container.__willowShow(null);
        }
        render(true);
        observeResize(container, render);
        return { tone, first, last, high: Math.max(...values), low: Math.min(...values) };
    }

    function sparkline(container, values, options = {}) {
        const data = (values || []).map(Number).filter(Number.isFinite);
        container.replaceChildren();
        if (data.length < 2) return;
        const width = 120;
        const height = 36;
        const min = Math.min(...data);
        const max = Math.max(...data);
        const span = max - min || 1;
        let d = '';
        data.forEach((value, index) => { d += `${index ? 'L' : 'M'}${(index / (data.length - 1) * width).toFixed(2)},${(height - 3 - ((value - min) / span) * (height - 6)).toFixed(2)}`; });
        const tone = options.tone || (data[data.length - 1] >= (Number.isFinite(options.baseline) ? options.baseline : data[0]) ? 'up' : 'down');
        const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: `sparkline is-${tone}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
        root.append(svg('path', { d }));
        container.append(root);
    }

    /** series: [{ label, value, color? }] */
    function donut(container, series, options = {}) {
        container.replaceChildren();
        const items = (series || []).filter(item => Number(item.value) > 0).map((item, index) => ({ ...item, value: Number(item.value), color: item.color || palette[index % palette.length] }));
        const total = items.reduce((sum, item) => sum + item.value, 0);
        const size = options.size || 200;
        const thickness = options.thickness || Math.round(size * 0.12);
        const radius = (size - thickness) / 2;
        const circumference = 2 * Math.PI * radius;
        const wrap = document.createElement('div');
        wrap.className = 'donut-wrap';
        wrap.style.cssText = 'display:flex;align-items:center;gap:28px;flex-wrap:wrap;';
        const ring = document.createElement('div');
        ring.className = 'donut';
        ring.style.width = `${size}px`;
        ring.style.height = `${size}px`;
        const description = items.map(item => `${item.label} ${total ? Math.round(item.value / total * 100) : 0}%`).join(', ');
        const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `${options.label || 'Allocation'}: ${description || 'no data'}` });
        root.append(svg('circle', { cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: 'var(--surface-muted)', 'stroke-width': thickness }));
        let offset = 0;
        const gap = items.length > 1 ? Math.min(4, circumference * 0.004) : 0;
        const segments = items.map(item => {
            const length = total ? (item.value / total) * circumference : 0;
            const seg = svg('circle', { class: 'donut-seg', cx: size / 2, cy: size / 2, r: radius, stroke: item.color, 'stroke-width': thickness, 'stroke-dasharray': `${Math.max(0, length - gap)} ${circumference}`, 'stroke-dashoffset': -offset });
            seg.setAttribute('style', `stroke:${item.color}`);
            offset += length;
            root.append(seg);
            return seg;
        });
        ring.append(root);
        const center = document.createElement('div');
        center.className = 'donut-center';
        const centerValue = document.createElement('strong');
        centerValue.textContent = options.centerValue !== undefined ? options.centerValue : (options.currency ? money(total, options.currency) : String(items.length));
        if (options.private) centerValue.setAttribute('data-private', '');
        const centerLabel = document.createElement('span');
        centerLabel.textContent = options.centerLabel || 'Total';
        center.append(centerValue, centerLabel);
        ring.append(center);
        wrap.append(ring);

        if (options.legend !== false && items.length) {
            const legend = document.createElement('ul');
            legend.className = 'legend';
            legend.style.flex = '1';
            legend.style.minWidth = '180px';
            items.forEach((item, index) => {
                const li = document.createElement('li');
                li.tabIndex = 0;
                const swatch = document.createElement('span');
                swatch.className = 'legend-swatch';
                swatch.style.background = item.color;
                const name = document.createElement('span');
                name.className = 'legend-label';
                name.textContent = item.label;
                li.append(swatch, name);
                if (options.currency || options.showValues) {
                    const value = document.createElement('span');
                    value.className = 'legend-value';
                    value.textContent = options.currency ? money(item.value, options.currency) : String(item.value);
                    if (options.private) value.setAttribute('data-private', '');
                    li.append(value);
                }
                const pct = document.createElement('span');
                pct.className = 'legend-pct';
                pct.textContent = `${total ? (item.value / total * 100).toFixed(1) : '0.0'}%`;
                li.append(pct);
                const activate = on => {
                    segments.forEach((seg, segIndex) => seg.classList.toggle('is-active', on && segIndex === index));
                    ring.classList.toggle('has-active', on);
                    if (on) {
                        centerValue.textContent = `${total ? (item.value / total * 100).toFixed(1) : 0}%`;
                        centerLabel.textContent = item.label;
                    } else {
                        centerValue.textContent = options.centerValue !== undefined ? options.centerValue : (options.currency ? money(total, options.currency) : String(items.length));
                        centerLabel.textContent = options.centerLabel || 'Total';
                    }
                };
                li.addEventListener('pointerenter', () => activate(true));
                li.addEventListener('pointerleave', () => activate(false));
                li.addEventListener('focus', () => activate(true));
                li.addEventListener('blur', () => activate(false));
                segments[index].addEventListener('pointerenter', () => activate(true));
                segments[index].addEventListener('pointerleave', () => activate(false));
                legend.append(li);
            });
            wrap.append(legend);
        }
        container.append(wrap);
    }

    /** Horizontal ranked bars. series: [{ label, value, color?, detail? }] */
    function bars(container, series, options = {}) {
        container.replaceChildren();
        const items = (series || []).filter(item => Number(item.value) > 0);
        const max = Math.max(...items.map(item => Number(item.value)), 1);
        const list = document.createElement('div');
        list.className = 'bar-list';
        list.setAttribute('role', 'list');
        items.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'bar-row';
            row.setAttribute('role', 'listitem');
            const label = document.createElement('span');
            label.className = 'bar-row-label';
            label.textContent = item.label;
            const value = document.createElement('span');
            value.className = 'bar-row-value';
            value.textContent = options.currency ? money(item.value, options.currency) : String(item.value);
            if (options.private !== false) value.setAttribute('data-private', '');
            const track = document.createElement('span');
            track.className = 'bar-row-track';
            const fill = document.createElement('span');
            fill.style.setProperty('--value', `${(Number(item.value) / max) * 100}%`);
            fill.style.setProperty('--bar-color', item.color || palette[index % palette.length]);
            track.append(fill);
            row.append(label, value, track);
            list.append(row);
        });
        container.append(list);
    }

    /**
     * Grouped vertical columns.
     * groups: [{ label, values: { key: number } }], options.keys: [{ key, label, color }]
     */
    function columns(container, groups, options = {}) {
        container.replaceChildren();
        container.classList.add('chart');
        const keys = options.keys || [];
        const all = groups.flatMap(group => keys.map(key => Number(group.values[key.key]) || 0));
        if (!groups.length || !keys.length) return;
        const tooltip = document.createElement('div');
        tooltip.className = 'chart-tooltip';
        tooltip.setAttribute('aria-hidden', 'true');
        const describe = groups.map(group => `${group.label}: ${keys.map(key => `${key.label} ${money(group.values[key.key] || 0, options.currency)}`).join(', ')}`).join('. ');

        function render() {
            container.querySelectorAll('svg').forEach(node => node.remove());
            const width = Math.max(280, container.clientWidth || 600);
            const height = options.height || 240;
            const pad = { top: 12, right: 8, bottom: 28, left: 52 };
            const max = Math.max(...all, 1) * 1.08;
            const innerW = width - pad.left - pad.right;
            const innerH = height - pad.top - pad.bottom;
            const groupW = innerW / groups.length;
            const barGap = 4;
            const barW = Math.max(4, Math.min(28, (groupW * 0.64 - barGap * (keys.length - 1)) / keys.length));
            const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': `${options.label || 'Columns'}. ${describe}` });
            const grid = svg('g', { class: 'chart-grid' });
            const axis = svg('g', { class: 'chart-axis' });
            niceTicks(0, max, 4).forEach(tick => {
                const ty = pad.top + (1 - tick / max) * innerH;
                grid.append(svg('line', { x1: pad.left, x2: width - pad.right, y1: ty, y2: ty }));
                const text = svg('text', { x: pad.left - 10, y: ty + 4, 'text-anchor': 'end' });
                text.textContent = formatAxisValue(tick, options.currency);
                axis.append(text);
            });
            root.append(grid, axis);
            const barsGroup = svg('g', { class: 'chart-bars' });
            groups.forEach((group, groupIndex) => {
                const gx = pad.left + groupIndex * groupW + (groupW - (barW * keys.length + barGap * (keys.length - 1))) / 2;
                const g = svg('g');
                keys.forEach((key, keyIndex) => {
                    const value = Number(group.values[key.key]) || 0;
                    const h = Math.max(value > 0 ? 2 : 0, (value / max) * innerH);
                    const rect = svg('rect', { class: 'chart-bar', x: gx + keyIndex * (barW + barGap), y: pad.top + innerH - h, width: barW, height: h, rx: Math.min(6, barW / 2) });
                    rect.setAttribute('style', `fill:${key.color || palette[keyIndex % palette.length]}`);
                    g.append(rect);
                });
                const hit = svg('rect', { x: pad.left + groupIndex * groupW, y: pad.top, width: groupW, height: innerH, fill: 'transparent' });
                hit.addEventListener('pointerenter', () => {
                    tooltip.replaceChildren();
                    const title = document.createElement('strong');
                    title.textContent = group.label;
                    tooltip.append(title);
                    keys.forEach(key => {
                        const line = document.createElement('span');
                        line.style.display = 'block';
                        line.textContent = `${key.label}: ${money(group.values[key.key] || 0, options.currency)}`;
                        tooltip.append(line);
                    });
                    const box = container.getBoundingClientRect();
                    const scale = box.width / width;
                    const left = Math.max(0, Math.min((pad.left + groupIndex * groupW + groupW / 2) * scale - 70, box.width - 150));
                    tooltip.style.transform = `translate(${left}px, 0px)`;
                    container.classList.add('is-hovering');
                });
                hit.addEventListener('pointerleave', () => container.classList.remove('is-hovering'));
                g.append(hit);
                barsGroup.append(g);
                const text = svg('text', { x: pad.left + groupIndex * groupW + groupW / 2, y: height - 8, 'text-anchor': 'middle' });
                text.textContent = group.label;
                axis.append(text);
            });
            root.append(barsGroup);
            container.prepend(root);
        }
        container.append(tooltip);
        render();
        observeResize(container, render);
    }

    global.WillowCharts = { line, sparkline, donut, bars, columns, palette };
})(window);
