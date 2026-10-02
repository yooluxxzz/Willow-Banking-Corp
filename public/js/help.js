'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('helpSearch');
    const topics = Array.from(document.querySelectorAll('.help-topic'));
    const status = document.getElementById('helpSearchStatus');
    input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        let count = 0;
        topics.forEach(topic => {
            const matches = !query || topic.textContent.toLowerCase().includes(query);
            topic.hidden = !matches;
            if (matches) count += 1;
        });
        status.textContent = query ? `${count} help ${count === 1 ? 'topic' : 'topics'} match your search.` : 'Browse the topics below.';
    });
});