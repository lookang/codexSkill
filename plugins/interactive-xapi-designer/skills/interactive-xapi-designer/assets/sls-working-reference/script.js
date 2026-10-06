// ===== GLOBAL VARIABLES =====
let score = 0;
let startTime = Date.now();
let draggedElement = null;
let touchStartX = 0;
let touchStartY = 0;
let sortedCount = 0;

// ADDED: Variable to track selected word for click interaction
let selectedWord = null;

// ADDED: Variables for tooltip functionality
let tooltipTimeout = null;
const wordTooltip = document.createElement('div'); // Will be initialized in DOMContentLoaded

// ===== MODIFIED: All words with their correct types, visual icons, AND educational feedback =====
// ADDED: Each word now has a 'feedback' property with learning tips about common misconceptions
// MODIFIED: Enhanced tooltip property with detailed learning information about common misconceptions
const allWords = [
    { 
        word: 'books', 
        type: 'countable', 
        icon: '📚',
        feedback: 'Books are countable! You can say "one book, two books, three books." Each book is a separate item you can count.',
        tooltip: '📚 Books are COUNTABLE because each book is a separate, individual item. You can count them: one book, two books, three books. Common mistake: Some students confuse "books" with "literature" (which is uncountable).'
    },
    { 
        word: 'cookies', 
        type: 'countable', 
        icon: '🍪',
        feedback: 'Cookies are countable! You can count them individually: "one cookie, two cookies." However, "cookie dough" would be uncountable.',
        tooltip: '🍪 Cookies are COUNTABLE because you can count individual cookies: one cookie, two cookies. Common misconception: "Cookie dough" is UNCOUNTABLE because it\'s a substance. Remember: whole items = countable, substances = uncountable.'
    },
    { 
        word: 'oil', 
        type: 'uncountable', 
        icon: '🛢️',
        feedback: 'Oil is uncountable because it\'s a liquid substance. You cannot say "one oil, two oils." However, you CAN count containers: "one bottle of oil, two bottles of oil."',
        tooltip: '🛢️ Oil is UNCOUNTABLE because it\'s a liquid substance without clear boundaries. You cannot say "one oil, two oils." Common tip: You CAN count containers of oil: "one bottle of oil, two bottles of oil." The container is countable, not the oil itself!'
    },
    { 
        word: 'pear', 
        type: 'countable', 
        icon: '🍐',
        feedback: 'Pear is countable! You can count individual pears: "one pear, two pears." All whole fruits are typically countable.',
        tooltip: '🍐 Pear is COUNTABLE because each pear is a separate, whole fruit. You can count them: one pear, two pears, three pears. Rule: Whole fruits are countable, but fruit juice or fruit pulp would be uncountable.'
    },
    { 
        word: 'salt', 
        type: 'uncountable', 
        icon: '🧂',
        feedback: 'Salt is uncountable because it consists of tiny grains that form a substance. You cannot say "one salt, two salts." But you can count: "one grain of salt" or "one packet of salt."',
        tooltip: '🧂 Salt is UNCOUNTABLE because it consists of countless tiny grains forming a substance. You cannot say "one salt, two salts." Learning tip: You CAN count units: "one grain of salt," "one packet of salt," "one pinch of salt." The unit is countable, not the salt!'
    },
    { 
        word: 'sugar', 
        type: 'uncountable', 
        icon: '🍬',
        feedback: 'Sugar is uncountable as a substance. You cannot say "one sugar, two sugars." However, you can count: "one spoonful of sugar" or "one bag of sugar."',
        tooltip: '🍬 Sugar is UNCOUNTABLE as a substance made of tiny crystals. You cannot say "one sugar, two sugars." Common mistake: In British English, "two sugars" means "two spoonfuls/cubes of sugar" in coffee. You\'re counting the units (spoonfuls), not the sugar itself!'
    },
    { 
        word: 'table', 
        type: 'countable', 
        icon: '🪑',
        feedback: 'Table is countable! You can count tables individually: "one table, two tables." All furniture items that are separate objects are countable.',
        tooltip: '🪑 Table is COUNTABLE because each table is a separate, distinct object. You can count them: one table, two tables. Rule: Individual furniture pieces are countable (chair, desk, bed), but "furniture" as a category is uncountable!'
    },
    { 
        word: 'water', 
        type: 'uncountable', 
        icon: '💧',
        feedback: 'Water is uncountable because it\'s a liquid. You cannot say "one water, two waters." But you CAN count containers: "one glass of water, two bottles of water."',
        tooltip: '💧 Water is UNCOUNTABLE because it\'s a liquid without fixed shape or boundaries. You cannot say "one water, two waters." Important tip: You CAN count containers: "one glass of water," "two bottles of water." This is the most common misconception - the container is countable, not the water!'
    }
];

// ===== INITIALIZE =====
document.addEventListener('DOMContentLoaded', function() {
    // Detect if standalone (new tab) or iframe
    if (window.self === window.top) {
        document.body.classList.add('standalone');
    }
    
    // Set total questions (now total words)
    document.getElementById('totalQuestions').textContent = allWords.length;
    
    // MODIFIED: Load all words at once with graphics
    loadAllWords();
    
    // Event Listeners
    document.getElementById('checkBtn').addEventListener('click', checkAllAnswers);
    document.getElementById('resetBtn').addEventListener('click', resetActivity);
    document.getElementById('toggleAnalyticsBtn').addEventListener('click', toggleAnalytics);
    document.getElementById('closeAnalyticsBtn').addEventListener('click', toggleAnalytics);
    document.getElementById('clearActionsBtn').addEventListener('click', clearActionLog);
    document.getElementById('clearQuizBtn').addEventListener('click', clearQuizLog);
    document.getElementById('helpBtn').addEventListener('click', showHelp);
    document.getElementById('closeHelpBtn').addEventListener('click', hideHelp);
    
    // ADDED: Click event listeners for drop zones to enable click-and-click interaction
    document.getElementById('countableZone').addEventListener('click', function(e) {
        handleZoneClick('countable', e);
    });
    document.getElementById('uncountableZone').addEventListener('click', function(e) {
        handleZoneClick('uncountable', e);
    });
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });
    
    // Setup drop zones
    setupDropZones();
    
    // Log initial action
    // MODIFIED: Updated log message to reflect that tooltips only appear after dropping
    logAction('🎬', 'Activity started - All words visible with graphics, click interaction enabled. Tooltips appear after dropping words.');
});

// ===== MODIFIED: Load all words at once WITH GRAPHICS, CLICK INTERACTION, and TOOLTIP FUNCTIONALITY for visual learning =====
function loadAllWords() {
    const container = document.getElementById('wordContainer');
    container.innerHTML = '';
    
    // Create a card for each word with its graphic/icon
    allWords.forEach(wordObj => {
        const card = document.createElement('div');
        card.className = 'word-card';
        
        // ADDED: Create icon element for visual representation
        const iconSpan = document.createElement('span');
        iconSpan.className = 'word-icon';
        iconSpan.textContent = wordObj.icon;
        
        // ADDED: Create text element for the word
        const textSpan = document.createElement('span');
        textSpan.className = 'word-text';
        textSpan.textContent = wordObj.word;
        
        // MODIFIED: Append both icon and text to card
        card.appendChild(iconSpan);
        card.appendChild(textSpan);
        
        card.draggable = true;
        card.dataset.word = wordObj.word;
        card.dataset.type = wordObj.type; // Store correct type
        card.dataset.icon = wordObj.icon; // Store icon for later use
        card.dataset.feedback = wordObj.feedback; // Store feedback for learning
        card.dataset.tooltip = wordObj.tooltip; // ADDED: Store tooltip text for hover display
        
        // ADDED: Click event for click-and-click interaction
        card.addEventListener('click', handleWordClick);
        
        // MODIFIED: Mouse events for tooltip display on hover - ONLY for dropped words
        // These event listeners will check if the word is dropped before showing tooltip
        card.addEventListener('mouseenter', handleWordHover);
        card.addEventListener('mouseleave', handleWordLeave);
        card.addEventListener('mousemove', handleWordMouseMove);
        
        // Mouse events
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        
        // Touch events for mobile
        card.addEventListener('touchstart', handleTouchStart, { passive: false });
        card.addEventListener('touchmove', handleTouchMove, { passive: false });
        card.addEventListener('touchend', handleTouchEnd, { passive: false });
        
        container.appendChild(card);
    });
    
    // Update instruction
    // MODIFIED: Updated instruction text to reflect tooltip behavior
    document.getElementById('instructionText').textContent = 
        'Click or drag all words to the correct baskets. Hover over placed words for learning tips!';
    
    // Disable check button initially
    document.getElementById('checkBtn').disabled = true;
    
    // MODIFIED: Updated log message
    logAction('📝', `All ${allWords.length} words loaded with graphics and click interaction. Tooltips will appear after dropping.`);
}

// ===== MODIFIED: Handle word card hover to show tooltip with learning information =====
// CHANGE: Tooltip only shows if the word has been dropped into a basket
function handleWordHover(e) {
    // MODIFIED: Only show tooltip if word is already dropped (placed in a basket)
    // Don't show tooltip if word is being dragged or still in the word container
    if (!this.classList.contains('dropped')) {
        return;
    }
    
    // Don't show tooltip if word is being dragged
    if (this.classList.contains('dragging')) {
        return;
    }
    
    const tooltip = document.getElementById('wordTooltip');
    const tooltipTitle = tooltip.querySelector('.tooltip-title');
    const tooltipDescription = tooltip.querySelector('.tooltip-description');
    
    // Set tooltip content from the word's data
    tooltipTitle.innerHTML = `${this.dataset.icon} ${this.dataset.word.toUpperCase()}`;
    tooltipDescription.textContent = this.dataset.tooltip;
    
    // Show tooltip with a slight delay for better UX
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
        tooltip.classList.add('show');
        // Position tooltip above the word card
        positionTooltip(tooltip, this);
    }, 300); // 300ms delay before showing
    
    // Log tooltip view for analytics
    logAction('💡', `Viewed learning tip for "${this.dataset.word}" ${this.dataset.icon} (after dropping)`);
    if (window.learningAnalytics) window.learningAnalytics.recordTip(this.dataset.word);
}

// ===== ADDED: Handle mouse leave to hide tooltip =====
function handleWordLeave(e) {
    clearTimeout(tooltipTimeout);
    const tooltip = document.getElementById('wordTooltip');
    tooltip.classList.remove('show');
}

// ===== ADDED: Handle mouse move to update tooltip position =====
function handleWordMouseMove(e) {
    const tooltip = document.getElementById('wordTooltip');
    if (tooltip.classList.contains('show')) {
        positionTooltip(tooltip, this);
    }
}

// ===== ADDED: Position tooltip above the word card =====
function positionTooltip(tooltip, element) {
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Position above the element, centered
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    let top = rect.top - tooltipRect.height - 15; // 15px gap above the element
    
    // Ensure tooltip stays within viewport
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    
    // If tooltip would go above viewport, show it below instead
    if (top < 10) {
        top = rect.bottom + 15;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

// ===== ADDED: Handle word card click for click-and-click interaction =====
function handleWordClick(e) {
    e.stopPropagation();
    
    // Hide tooltip when clicking
    const tooltip = document.getElementById('wordTooltip');
    tooltip.classList.remove('show');
    clearTimeout(tooltipTimeout);
    
    // If this word is already selected, deselect it
    if (selectedWord === this) {
        this.classList.remove('selected');
        selectedWord = null;
        removeZoneHighlights();
        logAction('🔄', `Deselected word "${this.dataset.word}" ${this.dataset.icon}`);
        return;
    }
    
    // Deselect previously selected word
    if (selectedWord) {
        selectedWord.classList.remove('selected');
    }
    
    // Select this word
    selectedWord = this;
    this.classList.add('selected');
    
    // Highlight drop zones to indicate they're clickable
    highlightZones();
    
    logAction('👆', `Selected word "${this.dataset.word}" ${this.dataset.icon} - Click a basket to place it`);
}

// ===== ADDED: Handle drop zone click for click-and-click interaction =====
function handleZoneClick(zoneType, e) {
    // Only process if a word is selected
    if (!selectedWord) {
        return;
    }
    
    // Prevent event from bubbling
    e.stopPropagation();
    
    // Get the drop area for this zone
    const dropArea = zoneType === 'countable' 
        ? document.getElementById('countableDropArea')
        : document.getElementById('uncountableDropArea');
    
    // Move the selected word to this zone
    dropArea.appendChild(selectedWord);
    selectedWord.classList.remove('selected', 'dragging');
    selectedWord.classList.add('dropped');
    
    // Remove zone highlights
    removeZoneHighlights();
    
    // Update sorted count and enable check button if all sorted
    updateSortedCount();
    
    logAction('✅', `Clicked to place "${selectedWord.dataset.word}" ${selectedWord.dataset.icon} into ${zoneType} zone`);
    if (window.learningAnalytics) window.learningAnalytics.recordPlacement(selectedWord.dataset.word, zoneType, selectedWord.dataset.type, 'click');
    
    // Clear selection
    selectedWord = null;
}

// ===== ADDED: Highlight drop zones when a word is selected =====
function highlightZones() {
    document.getElementById('countableZone').classList.add('clickable-highlight');
    document.getElementById('uncountableZone').classList.add('clickable-highlight');
}

// ===== ADDED: Remove highlights from drop zones =====
function removeZoneHighlights() {
    document.getElementById('countableZone').classList.remove('clickable-highlight');
    document.getElementById('uncountableZone').classList.remove('clickable-highlight');
}

// ===== DRAG AND DROP HANDLERS (MOUSE) =====
function handleDragStart(e) {
    // Hide tooltip when dragging starts
    const tooltip = document.getElementById('wordTooltip');
    tooltip.classList.remove('show');
    clearTimeout(tooltipTimeout);
    
    // Deselect if selected
    if (this.classList.contains('selected')) {
        this.classList.remove('selected');
        selectedWord = null;
        removeZoneHighlights();
    }
    
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    
    logAction('🖱️', `Started dragging "${this.dataset.word}" ${this.dataset.icon}`);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
}

// ===== TOUCH HANDLERS (MOBILE) =====
function handleTouchStart(e) {
    e.preventDefault();
    
    // Hide tooltip on touch
    const tooltip = document.getElementById('wordTooltip');
    tooltip.classList.remove('show');
    clearTimeout(tooltipTimeout);
    
    // Deselect if selected
    if (this.classList.contains('selected')) {
        this.classList.remove('selected');
        selectedWord = null;
        removeZoneHighlights();
    }
    
    draggedElement = this;
    this.classList.add('dragging');
    
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    
    logAction('👆', `Started dragging "${this.dataset.word}" ${this.dataset.icon} (touch)`);
}

function handleTouchMove(e) {
    e.preventDefault();
    
    if (!draggedElement) return;
    
    const touch = e.touches[0];
    const currentX = touch.clientX;
    const currentY = touch.clientY;
    
    // Move the element
    draggedElement.style.position = 'fixed';
    draggedElement.style.left = currentX - (draggedElement.offsetWidth / 2) + 'px';
    draggedElement.style.top = currentY - (draggedElement.offsetHeight / 2) + 'px';
    draggedElement.style.zIndex = '1000';
    
    // Check if over drop zone
    const dropZones = document.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
        const rect = zone.getBoundingClientRect();
        if (currentX >= rect.left && currentX <= rect.right &&
            currentY >= rect.top && currentY <= rect.bottom) {
            zone.classList.add('drag-over');
        } else {
            zone.classList.remove('drag-over');
        }
    });
}

function handleTouchEnd(e) {
    e.preventDefault();
    
    if (!draggedElement) return;
    
    const touch = e.changedTouches[0];
    const currentX = touch.clientX;
    const currentY = touch.clientY;
    
    // Reset element position
    draggedElement.style.position = '';
    draggedElement.style.left = '';
    draggedElement.style.top = '';
    draggedElement.style.zIndex = '';
    
    // Find drop zone
    const dropZones = document.querySelectorAll('.drop-zone');
    let dropped = false;
    
    dropZones.forEach(zone => {
        const rect = zone.getBoundingClientRect();
        if (currentX >= rect.left && currentX <= rect.right &&
            currentY >= rect.top && currentY <= rect.bottom) {
            const dropArea = zone.querySelector('.drop-area');
            dropArea.appendChild(draggedElement);
            draggedElement.classList.remove('dragging');
            draggedElement.classList.add('dropped');
            zone.classList.remove('drag-over');
            dropped = true;
            
            // Update sorted count and enable check button if all sorted
            updateSortedCount();
            
            logAction('✅', `Dropped "${draggedElement.dataset.word}" ${draggedElement.dataset.icon} into ${zone.dataset.type} zone`);
            if (window.learningAnalytics) window.learningAnalytics.recordPlacement(draggedElement.dataset.word, zone.dataset.type, draggedElement.dataset.type, 'touch');
        }
    });
    
    if (!dropped) {
        draggedElement.classList.remove('dragging');
    }
    
    draggedElement = null;
}

// ===== SETUP DROP ZONES =====
function setupDropZones() {
    const dropZones = document.querySelectorAll('.drop-zone');
    
    dropZones.forEach(zone => {
        // Drag over
        zone.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('drag-over');
        });
        
        // Drag leave
        zone.addEventListener('dragleave', function(e) {
            this.classList.remove('drag-over');
        });
        
        // Drop
        zone.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');
            
            if (draggedElement) {
                const dropArea = this.querySelector('.drop-area');
                dropArea.appendChild(draggedElement);
                draggedElement.classList.add('dropped');
                
                // Update sorted count and enable check button if all sorted
                updateSortedCount();
                
                logAction('✅', `Dropped "${draggedElement.dataset.word}" ${draggedElement.dataset.icon} into ${this.dataset.type} zone`);
                if (window.learningAnalytics) window.learningAnalytics.recordPlacement(draggedElement.dataset.word, this.dataset.type, draggedElement.dataset.type, 'drag');
            }
        });
    });
}

// ===== Update sorted count and enable check button =====
function updateSortedCount() {
    const countableArea = document.getElementById('countableDropArea');
    const uncountableArea = document.getElementById('uncountableDropArea');
    
    sortedCount = countableArea.children.length + uncountableArea.children.length;
    document.getElementById('currentQuestion').textContent = sortedCount;
    
    // Enable check button if all words are sorted
    if (sortedCount === allWords.length) {
        document.getElementById('checkBtn').disabled = false;
        logAction('✅', 'All words sorted - ready to check answers');
    }
}

// ===== MODIFIED: Check all answers at once WITH DETAILED EDUCATIONAL FEEDBACK =====
function checkAllAnswers() {
    const countableArea = document.getElementById('countableDropArea');
    const uncountableArea = document.getElementById('uncountableDropArea');
    
    let correctCount = 0;
    let incorrectCount = 0;
    const results = [];
    
    // Check countable area
    Array.from(countableArea.children).forEach(card => {
        const correctType = card.dataset.type;
        const isCorrect = correctType === 'countable';
        
        if (isCorrect) {
            card.classList.add('correct');
            correctCount++;
            results.push({ 
                word: card.dataset.word, 
                icon: card.dataset.icon, 
                feedback: card.dataset.feedback,
                correct: true, 
                zone: 'countable' 
            });
        } else {
            card.classList.add('incorrect');
            incorrectCount++;
            results.push({ 
                word: card.dataset.word, 
                icon: card.dataset.icon, 
                feedback: card.dataset.feedback,
                correct: false, 
                zone: 'countable', 
                correctZone: correctType 
            });
        }
    });
    
    // Check uncountable area
    Array.from(uncountableArea.children).forEach(card => {
        const correctType = card.dataset.type;
        const isCorrect = correctType === 'uncountable';
        
        if (isCorrect) {
            card.classList.add('correct');
            correctCount++;
            results.push({ 
                word: card.dataset.word, 
                icon: card.dataset.icon, 
                feedback: card.dataset.feedback,
                correct: true, 
                zone: 'uncountable' 
            });
        } else {
            card.classList.add('incorrect');
            incorrectCount++;
            results.push({ 
                word: card.dataset.word, 
                icon: card.dataset.icon, 
                feedback: card.dataset.feedback,
                correct: false, 
                zone: 'uncountable', 
                correctZone: correctType 
            });
        }
    });
    
    // Calculate score
    score = correctCount * 10;
    document.getElementById('score').textContent = score;
    
    // MODIFIED: Show feedback with detailed educational information
    const feedbackPanel = document.getElementById('feedbackPanel');
    const feedbackIcon = document.getElementById('feedbackIcon');
    const feedbackText = document.getElementById('feedbackText');
    
    // Create detailed feedback HTML
    let feedbackHTML = '';
    
    if (incorrectCount === 0) {
        feedbackPanel.classList.add('show', 'correct');
        feedbackIcon.textContent = '🏆';
        feedbackHTML = `<div>Perfect! All ${correctCount} words sorted correctly! Score: ${score} points</div>`;
    } else {
        feedbackPanel.classList.add('show', 'incorrect');
        feedbackIcon.textContent = '📊';
        feedbackHTML = `<div>${correctCount} correct, ${incorrectCount} incorrect. Score: ${score} points</div>`;
    }
    
    // ADDED: Add detailed feedback for each word with learning tips
    feedbackHTML += '<div class="feedback-details">';
    results.forEach(result => {
        const statusIcon = result.correct ? '✅' : '❌';
        const itemClass = result.correct ? 'correct' : 'incorrect';
        feedbackHTML += `
            <div class="feedback-item ${itemClass}">
                <strong>${statusIcon} ${result.icon} ${result.word}</strong><br>
                <em>${result.feedback}</em>
            </div>
        `;
    });
    feedbackHTML += '</div>';
    
    feedbackText.innerHTML = feedbackHTML;
    
    // Disable check button
    document.getElementById('checkBtn').disabled = true;
    
    // Log results
    logAction('📊', `Checked all answers: ${correctCount} correct, ${incorrectCount} incorrect`);
    
    // Log individual results with icons and feedback
    results.forEach(result => {
        if (result.correct) {
            logQuizResult(result.word, result.icon, result.zone, result.zone, true, result.feedback);
        } else {
            logQuizResult(result.word, result.icon, result.zone, result.correctZone, false, result.feedback);
        }
    });
    if (window.learningAnalytics) window.learningAnalytics.recordCheck(results);
}

// ===== RESET ACTIVITY =====
function resetActivity() {
    if (confirm('Are you sure you want to reset the activity? All progress will be lost.')) {
        score = 0;
        sortedCount = 0;
        startTime = Date.now();
        
        // ADDED: Clear any selected word
        selectedWord = null;
        removeZoneHighlights();
        
        // Hide tooltip
        const tooltip = document.getElementById('wordTooltip');
        tooltip.classList.remove('show');
        clearTimeout(tooltipTimeout);
        
        document.getElementById('score').textContent = score;
        document.getElementById('currentQuestion').textContent = 0;
        
        // Clear drop areas
        document.getElementById('countableDropArea').innerHTML = '';
        document.getElementById('uncountableDropArea').innerHTML = '';
        
        // Hide feedback
        const feedbackPanel = document.getElementById('feedbackPanel');
        feedbackPanel.classList.remove('show', 'correct', 'incorrect');
        
        // Reload all words with graphics
        loadAllWords();
        
        // MODIFIED: Updated log message
        logAction('🔄', 'Activity reset - all words reloaded. Tooltips will appear after dropping words.');
        if (window.learningAnalytics) window.learningAnalytics.recordReset();
    }
}

// ===== ANALYTICS FUNCTIONS =====
function toggleAnalytics() {
    const panel = document.getElementById('analyticsPanel');
    const btn = document.getElementById('toggleAnalyticsBtn');
    
    panel.classList.toggle('collapsed');
    
    if (panel.classList.contains('collapsed')) {
        btn.textContent = '📊 Show Analytics';
        logAction('📊', 'Analytics panel closed');
    } else {
        btn.textContent = '📊 Hide Analytics';
        logAction('📊', 'Analytics panel opened');
    }
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    if (tabName === 'actions') {
        document.getElementById('actionsTab').classList.add('active');
    } else if (tabName === 'quiz') {
        document.getElementById('quizTab').classList.add('active');
    }
}

function logAction(icon, description) {
    const log = document.getElementById('actionLog');
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
        <span class="timestamp">t=${elapsed}s</span>
        <span class="action-icon">${icon}</span>
        <span class="action-desc">${description}</span>
    `;
    
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

// MODIFIED: Quiz result logging now includes the visual icon AND educational feedback
function logQuizResult(word, icon, userAnswer, correctAnswer, isCorrect, feedback) {
    const log = document.getElementById('quizLog');
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${isCorrect ? 'correct' : 'incorrect'}`;
    entry.innerHTML = `
        <span class="timestamp">t=${elapsed}s</span>
        <span class="action-icon">${isCorrect ? '✅' : '❌'}</span>
        <span class="action-desc">
            <strong>${icon} "${word}"</strong><br>
            <div class="quiz-details">
                Your answer: ${userAnswer}<br>
                Correct answer: ${correctAnswer}<br>
                Result: ${isCorrect ? '✅ Correct' : '❌ Wrong'}<br>
                <em>💡 ${feedback}</em>
            </div>
        </span>
    `;
    
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

function clearActionLog() {
    const log = document.getElementById('actionLog');
    log.innerHTML = '<div class="log-entry"><span class="action-desc">Action log cleared</span></div>';
    startTime = Date.now();
}

function clearQuizLog() {
    const log = document.getElementById('quizLog');
    log.innerHTML = '<div class="log-entry"><span class="action-desc">Quiz results cleared</span></div>';
}

// ===== HELP FUNCTIONS =====
function showHelp() {
    const tooltip = document.getElementById('helpTooltip');
    tooltip.classList.add('show');
    logAction('❓', 'Help tooltip opened');
    if (window.learningAnalytics) window.learningAnalytics.recordHelp(true);
}

function hideHelp() {
    const tooltip = document.getElementById('helpTooltip');
    tooltip.classList.remove('show');
    logAction('❓', 'Help tooltip closed');
    if (window.learningAnalytics) window.learningAnalytics.recordHelp(false);
}
