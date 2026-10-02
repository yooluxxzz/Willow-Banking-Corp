/* Willow notifications — list, filter and mark as read. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const ICONS = { deposit: 'arrow-down-left', withdrawal: 'banknote', transfer: 'transfer', payment: 'send', card: 'card', security: 'shield', account: 'wallet', goal: 'target', wealth: 'trend', crypto: 'bitcoin', business: 'briefcase', system: 'info' };

    function init() {
        const list = doc.querySelector('[data-notification-list]');
        if (!list) return;
        const more = doc.querySelector('[data-notification-more]');
        const readAll = doc.querySelector('[data-read-all]');
        let filter = 'all';
        let page = 1;
        let items = [];

        const bell = doc.querySelector('.app-bell-count');
        const setBell = count => {
            if (!bell) return;
            if (count <= 0) bell.remove();
            else bell.textContent = count > 9 ? '9+' : String(count);
        };

        function row(note) {
            const unread = !note.is_read;
            const button = W.el('button', { type: 'button', className: `notification${unread ? ' is-unread' : ''}`, 'aria-label': `${note.title}${unread ? ', unread' : ''}` },
                W.el('span', { className: 'icon-tile icon-tile-sm' }, W.icon(ICONS[note.type] || 'bell')),
                W.el('span', { className: 'notification-main' },
                    W.el('strong', { text: note.title }),
                    W.el('span', { text: note.message }),
                    W.el('small', { text: `${W.relativeDay(note.created_at)} · ${W.formatDate(note.created_at, 'time')}` })),
                unread ? W.el('span', { className: 'notification-dot', 'aria-hidden': 'true' }) : null);
            button.addEventListener('click', async () => {
                if (!unread || note.is_read) return;
                note.is_read = 1;
                button.classList.remove('is-unread');
                const dot = button.querySelector('.notification-dot');
                if (dot) dot.remove();
                try { await W.api(`/api/notifications/${note.id}/read`, { method: 'POST' }); } catch (error) { /* non-critical */ }
                setBell(items.filter(item => !item.is_read).length);
                readAll.disabled = !items.some(item => !item.is_read);
                if (filter === 'unread') button.closest('li').remove();
            });
            return W.el('li', null, button);
        }

        function render() {
            if (!items.length) {
                list.replaceChildren(W.empty({ iconName: 'bell', title: filter === 'unread' ? 'You’re all caught up' : 'No notifications yet', text: filter === 'unread' ? 'No unread notifications.' : 'Updates about your money will appear here.', compact: true }));
                return;
            }
            list.replaceChildren(W.el('ul', { className: 'notification-list', role: 'list' }, items.map(row)));
        }

        async function load(reset = true) {
            if (reset) { page = 1; items = []; list.replaceChildren(W.skeletonRows(5)); }
            try {
                const data = await W.api(`/api/notifications?page=${page}&limit=20${filter === 'unread' ? '&unread=true' : ''}`);
                items = items.concat(data.notifications);
                render();
                more.hidden = data.page >= data.totalPages;
                readAll.disabled = !items.some(item => !item.is_read);
            } catch (error) {
                list.replaceChildren(W.empty({ iconName: 'alert', title: 'Notifications couldn’t load', text: error.message, error: true, action: { label: 'Try again', onClick: () => load() } }));
            }
        }

        doc.querySelectorAll('[data-filter]').forEach(tab => tab.addEventListener('click', () => {
            filter = tab.dataset.filter;
            doc.querySelectorAll('[data-filter]').forEach(item => { item.setAttribute('aria-selected', String(item === tab)); item.tabIndex = item === tab ? 0 : -1; });
            load();
        }));
        more.querySelector('[data-load-more]').addEventListener('click', () => { page += 1; load(false); });
        readAll.addEventListener('click', async () => {
            readAll.classList.add('is-loading');
            try {
                await W.api('/api/notifications/read-all', { method: 'POST' });
                items.forEach(item => { item.is_read = 1; });
                if (filter === 'unread') items = [];
                render();
                setBell(0);
                readAll.disabled = true;
            } catch (error) {
                W.showToast(error.message, 'error');
            } finally {
                readAll.classList.remove('is-loading');
            }
        });
        load();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
