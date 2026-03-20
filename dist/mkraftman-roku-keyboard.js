/**
 * mkraftman-roku-keyboard
 * Custom HACS card for Roku text input.
 * Opens native soft keyboard and sends keystrokes via remote.send_command
 * using literal_X for characters and backspace for deletions.
 */

class MkraftmanRokuKeyboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._el = {};
    this._built = false;
    this._active = false;
    this._prevText = "";
    this._commandQueue = [];
    this._processingQueue = false;
  }

  static getStubConfig() {
    return { entity: "remote.roku_ultra_living_room" };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("You must specify an 'entity'");
    this._config = config;
    if (this._hass) this._build();
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { rows: 2, columns: 12, min_rows: 2, min_columns: 6 };
  }

  getLayoutOptions() {
    return { grid_columns: 4, grid_rows: 2 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._built) this._build();
  }

  _build() {
    if (this._built || !this._hass || !this._config) return;

    const shadow = this.shadowRoot;
    shadow.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
        }
        .card {
          background: transparent;
          border-radius: 12px;
          padding: 12px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
        }

        /* Idle state: keyboard icon */
        .kb-btn {
          width: 55px;
          height: 55px;
          border-radius: 0;
          border: none;
          background: transparent;
          color: #A9A9A9;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          transition: opacity 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .kb-btn:active {
          opacity: 0.6;
        }
        .kb-btn ha-icon {
          --mdc-icon-size: 55px;
        }

        /* Active state: text display + clear button */
        .active-row {
          display: none;
          align-items: center;
          width: 100%;
          height: 56px;
          gap: 8px;
        }
        .active-row.visible {
          display: flex;
        }
        .text-display {
          flex: 1;
          font-size: 18px;
          font-weight: 500;
          color: var(--primary-text-color, #fff);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          user-select: none;
          height: 56px;
          line-height: 56px;
          cursor: text;
        }
        .text-display.placeholder {
          opacity: 0.4;
        }
        .clear-btn {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: rgba(var(--rgb-blue, 68, 115, 158), 0.2);
          color: var(--primary-text-color, #fff);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          font-size: 24px;
          font-weight: 700;
          line-height: 1;
          transition: background 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .clear-btn:active {
          background: rgba(var(--rgb-blue, 68, 115, 158), 0.35);
        }

        /* Hidden input to capture native keyboard */
        .hidden-input {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 1px;
          opacity: 0;
          border: none;
          outline: none;
          padding: 0;
          margin: 0;
          font-size: 16px;
          color: transparent;
          caret-color: transparent;
          background: transparent;
          pointer-events: none;
          -webkit-appearance: none;
          -webkit-text-fill-color: transparent;
        }
      </style>

      <div class="card">
        <button class="kb-btn" id="kbBtn">
          <ha-icon icon="mdi:keyboard-outline"></ha-icon>
        </button>
        <div class="active-row" id="activeRow">
          <div class="text-display placeholder" id="textDisplay">Type something...</div>
          <button class="clear-btn" id="clearBtn">&times;</button>
        </div>
        <input class="hidden-input" id="hiddenInput" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
      </div>
    `;

    this._el.kbBtn = shadow.getElementById("kbBtn");
    this._el.activeRow = shadow.getElementById("activeRow");
    this._el.textDisplay = shadow.getElementById("textDisplay");
    this._el.clearBtn = shadow.getElementById("clearBtn");
    this._el.hiddenInput = shadow.getElementById("hiddenInput");

    // Tap keyboard icon → activate
    this._el.kbBtn.addEventListener("click", () => this._activate());

    // Tap text display → refocus input (keeps keyboard open)
    this._el.textDisplay.addEventListener("click", () => {
      this._el.hiddenInput.focus();
    });

    // Input events → diff and send keystrokes
    this._el.hiddenInput.addEventListener("input", () => {
      const newText = this._el.hiddenInput.value;
      this._updateTextDisplay(newText);
      this._handleTextChange(newText);
      // Snap back to saved scroll position to prevent iOS drift
      if (this._savedScrollY !== null) {
        requestAnimationFrame(() => {
          window.scrollTo(0, this._savedScrollY);
        });
      }
    });

    // Clear button → send backspaces to clear and deactivate
    this._el.clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._deactivate(true);
    });

    // When keyboard dismisses (input loses focus), deactivate UI only
    this._el.hiddenInput.addEventListener("blur", () => {
      if (this._active) {
        setTimeout(() => {
          if (this._active) {
            this._deactivate(false);
          }
        }, 200);
      }
    });

    this._built = true;
  }

  _activate() {
    this._active = true;
    this._savedScrollY = null;
    this._prevText = "";
    this._el.kbBtn.style.display = "none";
    this._el.activeRow.classList.add("visible");
    this._el.hiddenInput.value = "";
    this._updateTextDisplay("");
    this._el.hiddenInput.style.pointerEvents = "auto";
    this._el.hiddenInput.focus();
    // Scroll the card into view above the keyboard, then save that position
    setTimeout(() => {
      this.scrollIntoView({ behavior: "smooth", block: "end" });
      setTimeout(() => {
        this._savedScrollY = window.scrollY;
      }, 500);
    }, 300);
  }

  _deactivate(clearText) {
    this._active = false;
    this._savedScrollY = null;

    if (clearText && this._prevText.length > 0) {
      // Send backspaces to clear all text on Roku
      for (let i = 0; i < this._prevText.length; i++) {
        this._enqueueCommand("backspace");
      }
    }

    // Clear any pending queue items beyond backspaces if not clearing
    this._prevText = "";

    this._el.hiddenInput.blur();
    this._el.hiddenInput.value = "";
    this._el.hiddenInput.style.pointerEvents = "none";
    this._el.activeRow.classList.remove("visible");
    this._el.kbBtn.style.display = "flex";
    this._updateTextDisplay("");
  }

  _updateTextDisplay(text) {
    if (text.length > 0) {
      this._el.textDisplay.textContent = text;
      this._el.textDisplay.classList.remove("placeholder");
    } else {
      this._el.textDisplay.textContent = "Type something...";
      this._el.textDisplay.classList.add("placeholder");
    }
  }

  _handleTextChange(newText) {
    const oldText = this._prevText;

    // Simple diff: if newText starts with oldText, chars were appended
    if (newText.startsWith(oldText)) {
      const added = newText.slice(oldText.length);
      for (const ch of added) {
        this._enqueueCommand("literal_" + ch);
      }
    }
    // If oldText starts with newText, chars were deleted from end
    else if (oldText.startsWith(newText)) {
      const removed = oldText.length - newText.length;
      for (let i = 0; i < removed; i++) {
        this._enqueueCommand("backspace");
      }
    }
    // Complex change (middle edit, paste, etc.) — delete all then retype
    else {
      for (let i = 0; i < oldText.length; i++) {
        this._enqueueCommand("backspace");
      }
      for (const ch of newText) {
        this._enqueueCommand("literal_" + ch);
      }
    }

    this._prevText = newText;
  }

  _enqueueCommand(command) {
    this._commandQueue.push(command);
    if (!this._processingQueue) {
      this._processQueue();
    }
  }

  _processQueue() {
    if (this._commandQueue.length === 0) {
      this._processingQueue = false;
      return;
    }

    this._processingQueue = true;
    const command = this._commandQueue.shift();
    this._sendCommand(command);

    // Small delay between commands to prevent Roku from dropping them
    setTimeout(() => this._processQueue(), 80);
  }

  _sendCommand(command) {
    if (!this._hass || !this._config) return;
    this._hass.callService("remote", "send_command", {
      entity_id: this._config.entity,
      command: command,
    });
  }

  connectedCallback() {
    if (this._hass && this._config && !this._built) {
      this._build();
    }
  }

  disconnectedCallback() {
    this._commandQueue = [];
    this._processingQueue = false;
    this._active = false;
  }
}

customElements.define("mkraftman-roku-keyboard", MkraftmanRokuKeyboard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "mkraftman-roku-keyboard",
  name: "Mkraftman Roku Keyboard",
  description: "Text input for Roku via remote.send_command literal keystrokes.",
});
