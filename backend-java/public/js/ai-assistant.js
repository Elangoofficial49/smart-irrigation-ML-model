/**
 * Smart Precision Irrigation AI Assistant ("AgroBot" / "விவசாய வழிகாட்டி")
 * Powered by Google Gemini 3.6 Flash when online +
 * Embedded Offline Tamil Agricultural NLP Engine for low-network field areas.
 * Features PWA offline voice synthesis and interactive crop controls.
 */

(function () {
  let currentLang = localStorage.getItem("agrobot_lang") || "ta"; // Default to Tamil
  let voiceEnabled = localStorage.getItem("agrobot_voice") !== "false"; // default true
  let isListening = false;
  let recognition = null;
  let synth = window.speechSynthesis;
  let currentAudio = null;

  // Initialize Speech Recognition if supported
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
  }

  // Inject Widget DOM
  function injectWidget() {
    if (document.getElementById("agrobotWidget")) return;

    const widgetDiv = document.createElement("div");
    widgetDiv.id = "agrobotWidget";
    widgetDiv.innerHTML = `
      <!-- Floating Trigger Button -->
      <button id="agrobotToggleBtn" class="agrobot-trigger" title="AI Farm Assistant | விவசாய வழிகாட்டி" aria-label="Open AI Assistant">
        <div class="agrobot-trigger-avatar">
          <i class="fa-solid fa-robot"></i>
        </div>
        <span class="agrobot-trigger-badge">AI</span>
      </button>

      <!-- Chat Window -->
      <div id="agrobotWindow" class="agrobot-window">
        <!-- Header -->
        <div class="agrobot-header">
          <div class="agrobot-header-info">
            <div class="agrobot-status-indicator"></div>
            <div>
              <div class="agrobot-title" id="agrobotHeaderTitle">${translations[currentLang].title}</div>
              <div class="agrobot-subtitle" id="agrobotHeaderSubtitle">${translations[currentLang].subtitle}</div>
            </div>
          </div>
          <div class="agrobot-header-actions">
            <!-- Language Switcher -->
            <div class="agrobot-lang-switch">
              <button type="button" class="lang-btn ${currentLang === 'ta' ? 'active' : ''}" data-lang="ta" title="தமிழ்">தமிழ்</button>
              <button type="button" class="lang-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en" title="English">EN</button>
            </div>
            <!-- Voice Mute Toggle -->
            <button type="button" id="agrobotVoiceToggle" class="agrobot-icon-btn ${voiceEnabled ? 'active' : ''}" title="Toggle Voice Output">
              <i class="fa-solid ${voiceEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}"></i>
            </button>
            <!-- Close Button -->
            <button type="button" id="agrobotCloseBtn" class="agrobot-icon-btn" title="Close">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Live Speaking Indicator -->
        <div id="agrobotSpeakingBar" class="agrobot-speaking-bar" style="display:none;">
          <div class="sound-wave">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <span id="agrobotSpeakingText">AgroBot பேசுகிறது...</span>
          <button type="button" id="agrobotStopSpeechBtn" class="btn-stop-speech" title="Stop Voice"><i class="fa-solid fa-stop"></i></button>
        </div>

        <!-- Messages Container -->
        <div id="agrobotMessages" class="agrobot-messages"></div>

        <!-- Quick Prompt Chips -->
        <div id="agrobotChips" class="agrobot-chips"></div>

        <!-- Input Area -->
        <form id="agrobotForm" class="agrobot-input-area">
          <!-- Voice Input Mic Button -->
          <button type="button" id="agrobotMicBtn" class="agrobot-mic-btn" title="Speak into Microphone (Voice Input)">
            <i class="fa-solid fa-microphone"></i>
          </button>
          <input type="text" id="agrobotInput" class="agrobot-input" placeholder="${translations[currentLang].placeholder}" autocomplete="off">
          <button type="submit" id="agrobotSendBtn" class="agrobot-send-btn" title="Send message">
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(widgetDiv);
    bindEvents();
    renderChips();
    sendGreeting();
  }

  const translations = {
    ta: {
      title: "AgroBot விவசாய வழிகாட்டி",
      subtitle: "துல்லிய AI &bull; தமிழ் & ஆஃப்லைன் NLP",
      placeholder: "மண் ஈரப்பதம், நீர்ப்பாசனம் அல்லது பயிர் பற்றி கேளுங்கள்...",
      speaking: "AgroBot பேசுகிறது...",
      listening: "கேட்கிறது... இப்போது பேசுங்கள்",
      welcome: "வணக்கம்! 🙏 நான் உங்கள் **AgroBot விவசாய வழிகாட்டி**. உங்கள் பயிர் மற்றும் நீர்ப்பாசனத்திற்கு நான் எவ்வாறு உதவ வேண்டும்?",
      chips: [
        { label: "💧 தண்ணீர் பாய்ச்சலாமா?", text: "இப்போது தண்ணீர் பாய்ச்சலாமா?" },
        { label: "📊 மண் ஈரப்பதம்", text: "மண் ஈரப்பதம் எவ்வளவு இருக்கிறது?" },
        { label: "🌿 உர மேலாண்மை", text: "உர மேலாண்மை எவ்வாறு செய்வது?" },
        { label: "🎋 கரும்பு பராமரிப்பு", text: "கரும்பு பயிருக்கு நீர் மேலாண்மை எப்படி செய்வது?" },
        { label: "🌾 நெல் சாகுபடி", text: "நெல் பயிருக்கான நீர் பரிந்துரை என்ன?" },
        { label: "🐛 பூச்சி கட்டுப்பாடு", text: "இயற்கை முறையில் பூச்சிகளை கட்டுப்படுத்துவது எப்படி?" }
      ]
    },
    en: {
      title: "AgroBot AI Assistant",
      subtitle: "Precision Agriculture &bull; Offline NLP Ready",
      placeholder: "Ask anything about your farm, moisture, weather...",
      speaking: "AgroBot is speaking...",
      listening: "Listening... Speak now",
      welcome: "Hello! 👋 I am **AgroBot**, your Precision Agriculture Guide. How can I assist your crops and irrigation today?",
      chips: [
        { label: "💧 Irrigate Now?", text: "Should I turn on irrigation now?" },
        { label: "📊 Soil Moisture", text: "What is the current soil moisture reading?" },
        { label: "🌿 Fertilizers", text: "How to manage crop fertilizers and NPK?" },
        { label: "🎋 Sugarcane Care", text: "How to manage sugarcane irrigation?" },
        { label: "🌾 Paddy Care", text: "What is the best irrigation for paddy?" },
        { label: "🐛 Pest Control", text: "How to control farm pests naturally?" }
      ]
    }
  };

  function bindEvents() {
    const toggleBtn = document.getElementById("agrobotToggleBtn");
    const windowEl = document.getElementById("agrobotWindow");
    const closeBtn = document.getElementById("agrobotCloseBtn");
    const form = document.getElementById("agrobotForm");
    const input = document.getElementById("agrobotInput");
    const micBtn = document.getElementById("agrobotMicBtn");
    const voiceToggle = document.getElementById("agrobotVoiceToggle");
    const stopSpeechBtn = document.getElementById("agrobotStopSpeechBtn");
    const langBtns = document.querySelectorAll(".agrobot-lang-switch .lang-btn");

    function toggleDrawer() {
      windowEl.classList.toggle("open");
      if (windowEl.classList.contains("open")) {
        input.focus();
      }
    }

    window.toggleAgroBot = toggleDrawer;
    toggleBtn.addEventListener("click", toggleDrawer);

    closeBtn.addEventListener("click", () => {
      windowEl.classList.remove("open");
      stopSpeaking();
    });

    langBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        langBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentLang = btn.getAttribute("data-lang");
        localStorage.setItem("agrobot_lang", currentLang);
        updateLanguageUI();
      });
    });

    voiceToggle.addEventListener("click", () => {
      voiceEnabled = !voiceEnabled;
      localStorage.setItem("agrobot_voice", voiceEnabled);
      voiceToggle.classList.toggle("active", voiceEnabled);
      voiceToggle.querySelector("i").className = voiceEnabled ? "fa-solid fa-volume-high" : "fa-solid fa-volume-xmark";
      if (!voiceEnabled) stopSpeaking();
      showToast(voiceEnabled ? (currentLang === 'ta' ? "குரல் ஒலி இயக்கப்பட்டது 🔊" : "Voice output enabled 🔊") : (currentLang === 'ta' ? "குரல் ஒலி முடக்கப்பட்டது 🔇" : "Voice output muted 🔇"), "info");
    });

    stopSpeechBtn.addEventListener("click", stopSpeaking);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      await handleUserMessage(text);
    });

    if (recognition) {
      recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add("listening");
        input.placeholder = translations[currentLang].listening;
      };

      recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        if (transcript) {
          input.value = transcript;
          handleUserMessage(transcript);
        }
      };

      recognition.onerror = (e) => {
        console.warn("Speech recognition error:", e.error);
        stopListening();
      };

      recognition.onend = () => {
        stopListening();
      };

      micBtn.addEventListener("click", () => {
        if (isListening) {
          recognition.stop();
          stopListening();
        } else {
          stopSpeaking();
          recognition.lang = currentLang === "ta" ? "ta-IN" : "en-IN";
          try {
            recognition.start();
          } catch (err) {
            console.warn(err);
          }
        }
      });
    } else {
      micBtn.style.opacity = "0.4";
      micBtn.title = "Voice recognition not supported on this browser (Chrome / Edge recommended)";
    }
  }

  function stopListening() {
    isListening = false;
    const micBtn = document.getElementById("agrobotMicBtn");
    const input = document.getElementById("agrobotInput");
    if (micBtn) micBtn.classList.remove("listening");
    if (input) input.placeholder = translations[currentLang].placeholder;
  }

  function updateLanguageUI() {
    const t = translations[currentLang];
    document.getElementById("agrobotHeaderTitle").textContent = t.title;
    document.getElementById("agrobotHeaderSubtitle").innerHTML = t.subtitle;
    document.getElementById("agrobotInput").placeholder = t.placeholder;
    renderChips();
    
    const msgContainer = document.getElementById("agrobotMessages");
    msgContainer.innerHTML = "";
    sendGreeting();
  }

  function renderChips() {
    const chipsContainer = document.getElementById("agrobotChips");
    if (!chipsContainer) return;
    const chips = translations[currentLang].chips;
    chipsContainer.innerHTML = chips.map(c => `<button type="button" class="agrobot-chip" data-text="${c.text}">${c.label}</button>`).join("");

    chipsContainer.querySelectorAll(".agrobot-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const text = chip.getAttribute("data-text");
        handleUserMessage(text);
      });
    });
  }

  function sendGreeting() {
    const msgContainer = document.getElementById("agrobotMessages");
    if (msgContainer.children.length > 0) return;
    appendMessage("bot", translations[currentLang].welcome);
  }

  async function handleUserMessage(text) {
    stopSpeaking();
    appendMessage("user", text);

    const sendBtn = document.getElementById("agrobotSendBtn");
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

    const typingId = appendTypingBubble();

    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, language: currentLang })
      });

      removeTypingBubble(typingId);

      const reply = res.reply || "Sorry, I could not process that request.";
      appendMessage("bot", reply);

      if (voiceEnabled && res.speech_text) {
        speakText(res.speech_text, res.language || currentLang);
      }
    } catch (err) {
      removeTypingBubble(typingId);
      
      // Execute Client-Side Offline Tamil NLP Engine
      console.log("[AgroBot] Running Client-side Offline Tamil NLP Engine for query:", text);
      const offlineRes = processOfflineTamilNlp(text, currentLang);
      
      const offlineBadge = `<div style="margin-top:6px; font-size:11px; opacity:0.8; color:#34d399;"><i class="fa-solid fa-bolt"></i> ${currentLang === 'ta' ? 'ஆஃப்லைன் AI பயன்முறை (Offline NLP)' : 'Offline NLP Mode'}</div>`;
      appendMessage("bot", offlineRes.reply + offlineBadge);
      
      if (voiceEnabled && offlineRes.speech_text) {
        fallbackToBrowserSynth(offlineRes.speech_text, currentLang === 'ta' ? 'ta-IN' : 'en-IN');
      }
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
  }

  /**
   * Embedded Client-Side Tamil Natural Language Processing (NLP) Engine
   * Executes instantly in remote agricultural fields with 0% internet connectivity.
   */
  function processOfflineTamilNlp(query, lang) {
    const q = query.toLowerCase().trim();
    const isTa = lang === "ta" || /[\u0B80-\u0BFF]/.test(query);

    // Read cached telemetry
    const cachedMoisture = localStorage.getItem("last_soil_moisture") || "48.5";
    const cachedTemp = localStorage.getItem("last_temp") || "30.0";
    const cachedPump = localStorage.getItem("last_pump_status") || "OFF";

    if (isTa) {
      if (containsAny(q, "ஆன் பண்ணு", "ஆன் செய்", "மோட்டார் போடு", "பம்பை ஆன்", "ஆன் பண்ண முடியுமா", "turn on")) {
        return {
          reply: `⚡ **ஆம், நிச்சயமாக!** மோட்டாரை இயக்க **Irrigation Control** பக்கத்தில் உள்ள **'Turn Pump ON'** பட்டனை அழுத்தவும்.\nதற்போதைய மண் ஈரப்பதம்: **${cachedMoisture}%**.`,
          speech_text: `ஆம் நிச்சயமாக! மோட்டாரை இயக்க நீர்ப்பாசன பக்கத்தில் Turn Pump ON பட்டனை அழுத்தவும். மண் ஈரப்பதம் ${cachedMoisture} சதவீதம்.`
        };
      }
      if (containsAny(q, "ஆப் பண்ணு", "ஆப் செய்", "நிறுத்து", "turn off")) {
        return {
          reply: `🛑 **மோட்டாரை நிறுத்த:** **Irrigation Control** பக்கத்தில் உள்ள **'Turn Pump OFF'** பட்டனை அழுத்தவும்.`,
          speech_text: `மோட்டாரை நிறுத்த நீர்ப்பாசன பக்கத்தில் Turn Pump OFF பட்டனை அழுத்தவும்.`
        };
      }
      if (containsAny(q, "தண்ணீர் பாய்ச்சலாமா", "தண்ணி பாய்ச்ச", "நீர் மேலாண்மை", "irrigate")) {
        const m = parseFloat(cachedMoisture);
        if (m < 35) {
          return {
            reply: `💧 **நீர்ப்பாசன பரிந்துரை (ஆஃப்லைன்):** உங்கள் வயலின் மண் ஈரப்பதம் குறைவாக உள்ளது (**${cachedMoisture}%**). இப்போது மோட்டாரை இயக்கி தண்ணீர் பாய்ச்சவும்.`,
            speech_text: `உங்கள் வயலின் மண் ஈரப்பதம் குறைவாக உள்ளது ${cachedMoisture} சதவீதம். இப்போது தண்ணீர் பாய்ச்ச பரிந்துரைக்கப்படுகிறது.`
          };
        } else {
          return {
            reply: `✅ **மண் ஈரப்பதம் போதுமானது (ஆஃப்லைன்):** தற்போதைய மண் ஈரப்பதம் **${cachedMoisture}%**. தற்போது நீர் பாய்ச்ச தேவையில்லை.`,
            speech_text: `மண் ஈரப்பதம் போதுமான அளவில் உள்ளது ${cachedMoisture} சதவீதம். தற்போது தண்ணீர் பாய்ச்ச தேவையில்லை.`
          };
        }
      }
      if (containsAny(q, "மண் ஈரம்", "ஈரப்பதம்", "சென்சார்", "sensor", "moisture")) {
        return {
          reply: `🌱 **நேரலை சென்சார் விவரங்கள் (தற்காலிக நினைவகம்):**\n• 💧 மண் ஈரப்பதம்: **${cachedMoisture}%**\n• 🌡️ வெப்பநிலை: **${cachedTemp}°C**\n• ⚡ மோட்டார் நிலை: **${cachedPump}**`,
          speech_text: `மண் ஈரப்பதம் ${cachedMoisture} சதவீதம். வெப்பநிலை ${cachedTemp} டிகிரி செல்சியஸ். மோட்டார் நிலை ${cachedPump}.`
        };
      }
      if (containsAny(q, "உரம்", "யூரியா", "டிஏபி", "பொட்டாஷ்", "பஞ்சகாவ்யா", "fertilizer")) {
        return {
          reply: `🌿 **உர மேலாண்மை வழிகாட்டல் (ஆஃப்லைன்):**\n• **அடிப்படை உரம்:** தொழு உரம் அல்லது மண்புழு உரம் இடவும்.\n• **NPK உரம்:** சொட்டுநீர் உரப்பாசனம் மூலம் நீரில் கரையும் உரங்களை இடுவது 40% உரத்தை சேமிக்கும்.\n• **இயற்கை உரம்:** 3% பஞ்சகாவ்யா தெளிக்கவும்.`,
          speech_text: `தொழு உரம் அல்லது மண்புழு உரம் இட்டு சொட்டுநீர் உரப்பாசனம் மூலம் நீரில் கரையும் உரங்களை இடவும்.`
        };
      }
      if (containsAny(q, "பூச்சி", "புழு", "நோய்", "pest", "disease")) {
        return {
          reply: `🐛 **இயற்கை பூச்சி மேலாண்மை (ஆஃப்லைன்):**\n• 3% வேப்பெண்ணெய் கரைசல் தெளிப்பது சாறு உறிஞ்சும் பூச்சிகளைக் கட்டுப்படுத்தும்.\n• மஞ்சள் மற்றும் நீல நிற ஒட்டும் பொறிகளை வயலில் வைக்கவும்.`,
          speech_text: `மூன்று சதவீதம் வேப்பெண்ணெய் கரைசல் தெளிப்பது சாறு உறிஞ்சும் பூச்சிகளைக் கட்டுப்படுத்தும்.`
        };
      }
      if (containsAny(q, "கரும்பு", "sugarcane")) {
        return {
          reply: `🎋 **கரும்பு பயிர் வழிகாட்டி (ஆஃப்லைன்):**\n• முளைப்பு பருவத்தில் 7 நாட்களுக்கு ஒருமுறை நீர் பாய்ச்சவும்.\n• மண் ஈரப்பதம் 50-60% இருக்குமாறு சொட்டுநீர்ப்பாசனம் அமைப்பது 45% நீரைச் சேமிக்கும்.`,
          speech_text: `கரும்பு பயிருக்கு மண் ஈரப்பதம் ஐம்பது முதல் அறுபது சதவீதம் இருக்குமாறு சொட்டுநீர்ப்பாசனம் அமைக்கவும்.`
        };
      }
      if (containsAny(q, "நெல்", "paddy", "rice")) {
        return {
          reply: `🌾 **நெல் பயிர் வழிகாட்டி (ஆஃப்லைன்):**\n• தூர் கட்டும் பருவத்தில் மாறி மாறி நனைத்து உலர்த்தும் (AWD) முறையைப் பயன்படுத்தி நீரைச் சேமிக்கவும்.`,
          speech_text: `நெல் பயிருக்கு மாறி மாறி நனைத்து உலர்த்தும் முறையைப் பயன்படுத்தி நீரைச் சேமிக்கவும்.`
        };
      }
      if (containsAny(q, "நன்றி", "thanks", "ok")) {
        return {
          reply: `மகிழ்ச்சி! 🙏 உங்கள் விவசாயம் செழிக்க வாழ்த்துகள். ஆஃப்லைன் முறையிலும் நான் உங்களுக்கு உதவத் தயாராக உள்ளேன்!`,
          speech_text: `மகிழ்ச்சி! உங்கள் விவசாயம் செழிக்க வாழ்த்துகள்.`
        };
      }
      if (containsAny(q, "நாளை", "வரேன்", "பாய்", "bye")) {
        return {
          reply: `சரிங்க! 👍 நாளை காலை வாருங்கள். உங்கள் பண்ணைத் தரவுகளை நான் தொடர்ந்து கண்காணிப்பேன்!`,
          speech_text: `சரிங்க! நாளை காலை வாருங்கள். உங்கள் பண்ணைத் தரவுகளை நான் தொடர்ந்து கண்காணிப்பேன்.`
        };
      }
      return {
        reply: `வணக்கம்! 🙏 ஆஃப்லைன் AI முறை செயல்படுகிறது.\n• மண் ஈரப்பதம்: **${cachedMoisture}%**\n• மோட்டார் நிலை: **${cachedPump}**\nநீர்ப்பாசனம், உரம், பூச்சி மேலாண்மை அல்லது பயிர் பராமரிப்பு பற்றி கேளுங்கள்!`,
        speech_text: `வணக்கம்! ஆஃப்லைன் முறை செயல்படுகிறது. மண் ஈரப்பதம் ${cachedMoisture} சதவீதம்.`
      };
    } else {
      // English Offline NLP
      return {
        reply: `🌱 **AgroBot Offline NLP Mode:**\n• Soil Moisture: **${cachedMoisture}%**\n• Temperature: **${cachedTemp}°C**\n• Pump: **${cachedPump}**\nAsk about irrigation schedules, fertilizers, pests, or crop guides!`,
        speech_text: `AgroBot offline mode. Current soil moisture is ${cachedMoisture} percent.`
      };
    }
  }

  function containsAny(text, ...keywords) {
    for (let k of keywords) {
      if (text.includes(k)) return true;
    }
    return false;
  }

  function appendMessage(sender, text) {
    const msgContainer = document.getElementById("agrobotMessages");
    const msgDiv = document.createElement("div");
    msgDiv.className = `agrobot-msg ${sender}`;

    const formatted = formatMarkdown(text);
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    msgDiv.innerHTML = `
      <div class="agrobot-msg-content">${formatted}</div>
      <div class="agrobot-msg-time">${time}</div>
    `;

    msgContainer.appendChild(msgDiv);
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  function appendTypingBubble() {
    const msgContainer = document.getElementById("agrobotMessages");
    const id = "typing_" + Date.now();
    const div = document.createElement("div");
    div.id = id;
    div.className = "agrobot-msg bot typing";
    div.innerHTML = `<div class="agrobot-msg-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
    return id;
  }

  function removeTypingBubble(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n• /g, "<br>&bull; ")
      .replace(/\n1\. /g, "<br>1. ")
      .replace(/\n2\. /g, "<br>2. ")
      .replace(/\n3\. /g, "<br>3. ")
      .replace(/\n4\. /g, "<br>4. ")
      .replace(/\n5\. /g, "<br>5. ")
      .replace(/\n/g, "<br>");
  }

  // Speaks aloud using Server Audio Stream (/api/tts) or Web Speech API
  function speakText(text, lang) {
    stopSpeaking();
    if (!voiceEnabled) return;

    const isTamil = lang === "ta" || /[\u0B80-\u0BFF]/.test(text);
    const speakingBar = document.getElementById("agrobotSpeakingBar");
    const speakingText = document.getElementById("agrobotSpeakingText");

    if (speakingBar) {
      speakingText.textContent = isTamil ? "AgroBot பேசுகிறது..." : "AgroBot is speaking...";
      speakingBar.style.display = "flex";
    }

    let cleanText = text
      .replace(/[*#•_`\\[\\]()]/g, " ")
      .replace(/%/g, isTamil ? " சதவீதம் " : " percent ")
      .replace(/°C/g, isTamil ? " டிகிரி செல்சியஸ் " : " degrees celsius ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanText.length > 200) {
      cleanText = cleanText.substring(0, 200);
    }

    // Priority 1: High-Clarity Audio Stream from Server Endpoint (/api/tts) if online
    if (navigator.onLine) {
      const ttsUrl = `${API_BASE}/api/tts?lang=${isTamil ? 'ta' : 'en'}&text=${encodeURIComponent(cleanText)}`;
      currentAudio = new Audio(ttsUrl);

      currentAudio.onended = () => {
        if (speakingBar) speakingBar.style.display = "none";
        currentAudio = null;
      };

      currentAudio.onerror = () => {
        fallbackToBrowserSynth(cleanText, isTamil ? 'ta-IN' : 'en-IN');
      };

      currentAudio.play().catch(err => {
        fallbackToBrowserSynth(cleanText, isTamil ? 'ta-IN' : 'en-IN');
      });
    } else {
      // Offline fallback: Direct Browser Speech Synthesis
      fallbackToBrowserSynth(cleanText, isTamil ? 'ta-IN' : 'en-IN');
    }
  }

  function fallbackToBrowserSynth(cleanText, targetLang) {
    if (!synth) return;
    synth.cancel();
    if (synth.paused) synth.resume();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = targetLang;
    utterance.rate = targetLang.startsWith("ta") ? 0.9 : 1.0;
    utterance.pitch = 1.0;

    const speakingBar = document.getElementById("agrobotSpeakingBar");

    utterance.onend = () => { if (speakingBar) speakingBar.style.display = "none"; };
    utterance.onerror = () => { if (speakingBar) speakingBar.style.display = "none"; };

    synth.speak(utterance);
  }

  function stopSpeaking() {
    if (synth) {
      synth.cancel();
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    const speakingBar = document.getElementById("agrobotSpeakingBar");
    if (speakingBar) speakingBar.style.display = "none";
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem("token")) {
      injectWidget();
    }
  });

})();
