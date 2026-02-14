/**
 * THE GALACTIC ORDER - Dialogue System
 *
 * Terminal-style dialogue for NPC encounters.
 * Text appears one character at a time (typing effect).
 * Multiple dialogue lines queue up and play sequentially.
 *
 * Triggered by proximity — when player walks near an NPC,
 * the dialogue box rises from the bottom of the screen.
 *
 * The Mysterious Being's dialogue leads the player toward:
 * 1. Understanding that the universe runs on rules
 * 2. Finding cipher fragments in the terrain
 * 3. Providing the "Key of Insight" (Gemini API key)
 */

// ============================================================
// DIALOGUE SYSTEM
// ============================================================

export class DialogueSystem {
    /**
     * @param {Object} options
     * @param {Function} [options.onDialogueComplete] - Called when all lines finish
     * @param {Function} [options.onChoice] - Called when player picks a dialogue choice
     */
    constructor(options = {}) {
        this.onDialogueComplete = options.onDialogueComplete || null;
        this.onChoice = options.onChoice || null;

        // State
        this.isActive = false;
        this.currentLines = [];
        this.currentLineIndex = 0;
        this.currentCharIndex = 0;
        this.typingSpeed = 30; // ms per character
        this.typingTimer = null;
        this.isTyping = false;
        this.waitingForInput = false;

        // Speaker info
        this.speakerName = '';
        this.speakerColor = '#00ff88';

        // Build DOM
        this._buildDOM();
        this._bindEvents();
    }

    // ============================================================
    // DOM
    // ============================================================

    _buildDOM() {
        this.container = document.createElement('div');
        this.container.id = 'dialogue-container';
        this.container.innerHTML = `
            <div class="dialogue-box">
                <div class="dialogue-speaker" id="dialogueSpeaker"></div>
                <div class="dialogue-text" id="dialogueText"></div>
                <div class="dialogue-prompt" id="dialoguePrompt">
                    <span class="prompt-blink">▼</span> <span class="prompt-text">PRESS SPACE OR CLICK</span>
                </div>
                <div class="dialogue-choices" id="dialogueChoices"></div>
            </div>
            <div class="dialogue-indicator" id="dialogueIndicator">
                <div class="indicator-diamond">◈</div>
                <div class="indicator-text">APPROACH</div>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #dialogue-container {
                position: fixed;
                bottom: 0; left: 0; right: 0;
                z-index: 30;
                pointer-events: none;
            }

            .dialogue-box {
                position: absolute;
                bottom: -200px;
                left: 50%;
                transform: translateX(-50%);
                width: 650px;
                max-width: 90vw;
                background: rgba(0, 4, 2, 0.92);
                border: 1px solid rgba(0, 255, 136, 0.25);
                border-bottom: none;
                padding: 20px 24px;
                pointer-events: all;
                transition: bottom 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                backdrop-filter: blur(8px);
                box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
            }
            .dialogue-box.visible {
                bottom: 0;
            }

            .dialogue-speaker {
                font-family: 'Courier New', monospace;
                font-size: 11px;
                letter-spacing: 4px;
                margin-bottom: 12px;
                color: #00ff88;
            }

            .dialogue-text {
                font-family: 'Courier New', monospace;
                font-size: 14px;
                line-height: 1.7;
                color: #ccd;
                min-height: 60px;
                white-space: pre-wrap;
            }

            .dialogue-prompt {
                margin-top: 12px;
                font-family: 'Courier New', monospace;
                font-size: 10px;
                color: #334;
                letter-spacing: 1px;
                opacity: 0;
                transition: opacity 0.3s;
            }
            .dialogue-prompt.visible { opacity: 1; }
            .prompt-blink {
                animation: blinkAnim 1s infinite;
                color: #00ff88;
            }
            @keyframes blinkAnim {
                0%, 100% { opacity: 1; }
                50% { opacity: 0; }
            }

            .dialogue-choices {
                margin-top: 12px;
                display: none;
            }
            .dialogue-choices.visible { display: block; }
            .choice-btn {
                display: block;
                width: 100%;
                text-align: left;
                background: transparent;
                border: 1px solid rgba(0,255,136,0.15);
                color: #889;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                padding: 8px 16px;
                margin-bottom: 4px;
                cursor: pointer;
                transition: all 0.3s;
                pointer-events: all;
            }
            .choice-btn:hover {
                background: rgba(0,255,136,0.05);
                border-color: rgba(0,255,136,0.4);
                color: #00ff88;
            }
            .choice-btn .choice-prefix {
                color: #00ff88;
                margin-right: 8px;
            }

            /* Proximity indicator (shown before dialogue starts) */
            .dialogue-indicator {
                position: fixed;
                bottom: 100px;
                left: 50%;
                transform: translateX(-50%);
                text-align: center;
                opacity: 0;
                transition: opacity 0.5s;
                pointer-events: none;
            }
            .dialogue-indicator.visible { opacity: 1; }
            .indicator-diamond {
                font-size: 24px;
                color: #00ff88;
                animation: diamondPulse 2s infinite;
            }
            @keyframes diamondPulse {
                0%, 100% { opacity: 0.4; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.2); }
            }
            .indicator-text {
                color: #445;
                font-family: 'Courier New', monospace;
                font-size: 10px;
                letter-spacing: 3px;
                margin-top: 4px;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(this.container);

        this.boxEl = this.container.querySelector('.dialogue-box');
        this.textEl = this.container.querySelector('#dialogueText');
        this.speakerEl = this.container.querySelector('#dialogueSpeaker');
        this.promptEl = this.container.querySelector('#dialoguePrompt');
        this.choicesEl = this.container.querySelector('#dialogueChoices');
        this.indicatorEl = this.container.querySelector('#dialogueIndicator');
    }

    _bindEvents() {
        // Advance dialogue on click or space
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.isActive && this.waitingForInput) {
                e.preventDefault();
                this._advance();
            }
            // Skip typing animation on any key
            if (this.isActive && this.isTyping) {
                this._finishTyping();
            }
        });

        this.boxEl.addEventListener('click', () => {
            if (this.waitingForInput) {
                this._advance();
            } else if (this.isTyping) {
                this._finishTyping();
            }
        });
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    /**
     * Show the proximity indicator (before dialogue triggers).
     */
    showProximityHint() {
        this.indicatorEl.classList.add('visible');
    }

    hideProximityHint() {
        this.indicatorEl.classList.remove('visible');
    }

    /**
     * Start a dialogue sequence.
     *
     * @param {string} speaker - Name of the speaker
     * @param {string[]} lines - Array of dialogue lines
     * @param {Object} [options]
     * @param {string} [options.speakerColor] - Color for speaker name
     * @param {Array} [options.choices] - Choices after last line [{text, id}]
     */
    startDialogue(speaker, lines, options = {}) {
        this.speakerName = speaker;
        this.speakerColor = options.speakerColor || '#00ff88';
        this.currentLines = lines;
        this.currentLineIndex = 0;
        this.choices = options.choices || null;
        this.isActive = true;

        // Hide proximity hint
        this.hideProximityHint();

        // Update speaker
        this.speakerEl.textContent = speaker.toUpperCase();
        this.speakerEl.style.color = this.speakerColor;

        // Show dialogue box
        this.boxEl.classList.add('visible');

        // Start first line
        this._typeLine(this.currentLines[0]);
    }

    /**
     * Close the dialogue.
     */
    closeDialogue() {
        this.isActive = false;
        this.waitingForInput = false;
        this._stopTyping();

        this.boxEl.classList.remove('visible');
        this.choicesEl.classList.remove('visible');

        if (this.onDialogueComplete) {
            this.onDialogueComplete();
        }
    }

    /**
     * Is dialogue currently showing?
     */
    isDialogueActive() {
        return this.isActive;
    }

    // ============================================================
    // INTERNAL
    // ============================================================

    _typeLine(text) {
        this.textEl.textContent = '';
        this.promptEl.classList.remove('visible');
        this.choicesEl.classList.remove('visible');
        this.isTyping = true;
        this.waitingForInput = false;
        this.currentCharIndex = 0;
        this._currentText = text;

        this._typeNextChar();
    }

    _typeNextChar() {
        if (this.currentCharIndex >= this._currentText.length) {
            this._onLineComplete();
            return;
        }

        this.textEl.textContent += this._currentText[this.currentCharIndex];
        this.currentCharIndex++;

        // Variable speed: pause on punctuation
        const char = this._currentText[this.currentCharIndex - 1];
        let delay = this.typingSpeed;
        if (char === '.' || char === '!' || char === '?') delay = 300;
        else if (char === ',') delay = 150;
        else if (char === '—' || char === '…') delay = 200;

        this.typingTimer = setTimeout(() => this._typeNextChar(), delay);
    }

    _finishTyping() {
        this._stopTyping();
        this.textEl.textContent = this._currentText;
        this._onLineComplete();
    }

    _stopTyping() {
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }
        this.isTyping = false;
    }

    _onLineComplete() {
        this.isTyping = false;

        const isLastLine = this.currentLineIndex >= this.currentLines.length - 1;

        if (isLastLine && this.choices) {
            // Show choices
            this._showChoices();
        } else {
            // Show "continue" prompt
            this.promptEl.classList.add('visible');
            this.waitingForInput = true;
        }
    }

    _advance() {
        this.waitingForInput = false;
        this.promptEl.classList.remove('visible');
        this.currentLineIndex++;

        if (this.currentLineIndex >= this.currentLines.length) {
            // All lines done
            this.closeDialogue();
        } else {
            this._typeLine(this.currentLines[this.currentLineIndex]);
        }
    }

    _showChoices() {
        this.choicesEl.innerHTML = '';
        this.choicesEl.classList.add('visible');

        this.choices.forEach((choice, i) => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.innerHTML = `<span class="choice-prefix">[${i + 1}]</span> ${choice.text}`;
            btn.addEventListener('click', () => {
                this.choicesEl.classList.remove('visible');
                if (this.onChoice) {
                    this.onChoice(choice.id, choice);
                }
                this.closeDialogue();
            });
            this.choicesEl.appendChild(btn);
        });
    }

    dispose() {
        this._stopTyping();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
